/**
 * Speech controller — the single entry point the app uses to speak.
 *
 * Responsibilities:
 *   1. pick a provider that can actually speak the requested language
 *      (native browser voice first, then the local offline service);
 *   2. guarantee one speech job at a time, cancelling whatever was queued;
 *   3. drop duplicate requests (React rerenders, repeated WebSocket
 *      predictions for the same sign);
 *   4. publish honest state (`generating` / `speaking` / error) for the UI,
 *      and never report success without audio.
 */

import { BrowserTtsProvider, ensureVoices, invalidateVoices } from './browserProvider.ts'
import { LANGUAGE_LABELS, speechTag } from './bcp47.ts'
import { LocalTtsProvider } from './localProvider.ts'
import type {
  SpeakOutcome,
  SpeakRequest,
  SpeechLanguage,
  SpeechState,
  TtsError,
  TtsProvider,
} from './types.ts'
import { initialSpeechState } from './settings.ts'

/** Identical auto-speak requests inside this window are dropped. */
export const DEDUPE_WINDOW_MS = 1500

/**
 * How often to re-probe while something is still unavailable. The service takes
 * a few seconds to open its port and is often started *after* the page, so a
 * one-shot probe would leave a permanent "service is not answering" warning.
 */
const RECHECK_INTERVAL_MS = 4_000

export interface SpeakOverrides {
  rate?: number
  pitch?: number
  /** Drop repeats of the same key inside DEDUPE_WINDOW_MS. */
  dedupeKey?: string
  /**
   * Bypass the dedupe window. Use for an explicit user action (the Speak
   * button) so the same sentence can be re-read on demand instead of being
   * silently swallowed because it happened to play a moment ago.
   */
  force?: boolean
}

type Listener = (state: SpeechState) => void

/**
 * Explain, honestly, why nothing could speak this language.
 *
 * The distinction matters to the user: a service that is *running but has no
 * model* needs a different fix from one that is *not running at all*.
 */
async function explainNoProvider(
  language: SpeechLanguage,
  providers: readonly TtsProvider[],
): Promise<TtsError> {
  const local = providers.find((p) => p.id === 'local')
  if (local) {
    let reachable = false
    try {
      reachable = await local.isUsable()
    } catch {
      reachable = false
    }
    if (!reachable) {
      return {
        kind: 'service-offline',
        message: `No speech voice for ${LANGUAGE_LABELS[language]} is installed on this system, and the local speech service is not running.`,
        action: 'Start it with tools\\tts-service\\run.bat to generate speech offline.',
        retryable: true,
      }
    }
    return {
      kind: 'unsupported-language',
      message: `The local speech service is running but has no ${LANGUAGE_LABELS[language]} voice model.`,
      action: 'Run tools\\tts-service\\install.bat to download it, then press Speak again.',
      retryable: false,
      // The very first download needs an internet connection; after that the
      // service is fully offline.
      needsNetwork: true,
    }
  }
  return {
    kind: 'no-voice',
    message: `No speech engine can read ${LANGUAGE_LABELS[language]} on this device.`,
    retryable: false,
  }
}

const SUPERSEDED: TtsError = {
  kind: 'superseded',
  message: 'This speech request was replaced by a newer one.',
  retryable: false,
}

/** Result handed back to a caller whose request was overtaken. */
function supersededOutcome(request: SpeakRequest): SpeakOutcome {
  return {
    ok: false,
    provider: null,
    text: request.text,
    language: request.language,
    lang: speechTag(request.language),
    voiceName: null,
    voiceLang: null,
    voiceMatch: 'unavailable',
    missingVoice: false,
    error: SUPERSEDED,
  }
}

export class TtsController {
  private readonly providers: TtsProvider[]
  private readonly listeners = new Set<Listener>()
  private state: SpeechState = initialSpeechState()
  private sequence = 0
  private lastRequest: { key: string; at: number; outcome: SpeakOutcome } | null = null
  private refreshing: Promise<SpeechState> | null = null
  private recheckTimer: ReturnType<typeof setTimeout> | null = null

  constructor(providers: TtsProvider[] = [new BrowserTtsProvider(), new LocalTtsProvider()]) {
    this.providers = providers
    for (const provider of providers) {
      // Providers that play audio report when playback ends or fails after the
      // request resolved, so the UI never stays stuck on "speaking".
      const withHooks = provider as TtsProvider & {
        onEnded?: (() => void) | null
        onFailure?: ((error: TtsError) => void) | null
      }
      if ('onEnded' in withHooks) withHooks.onEnded = () => this.handleEnded(provider)
      if ('onFailure' in withHooks) withHooks.onFailure = (error) => this.handleFailure(error)
    }
  }

  /** Providers in priority order (first usable one wins). */
  get providerList(): readonly TtsProvider[] {
    return this.providers
  }

  getState(): SpeechState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private patch(partial: Partial<SpeechState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener(this.state)
  }

  private handleEnded(provider: TtsProvider): void {
    if (this.state.provider !== provider.id) return
    this.patch({ phase: 'idle' })
  }

  private handleFailure(error: TtsError): void {
    this.patch({ phase: 'idle', error })
  }

  /**
   * Speak translated text in the selected output language.
   *
   * Resolves with the real outcome — callers must not assume success.
   */
  async speak(
    text: string,
    language: SpeechLanguage,
    overrides: SpeakOverrides = {},
  ): Promise<SpeakOutcome> {
    const request: SpeakRequest = { text, language, ...overrides }

    if (!text || !text.trim()) {
      return {
        ok: false,
        provider: null,
        text,
        language,
        lang: '',
        voiceName: null,
        voiceLang: null,
        voiceMatch: 'unavailable',
        missingVoice: true,
        error: { kind: 'empty-text', message: 'There is nothing to read aloud yet.', retryable: false },
      }
    }

    const key = overrides.dedupeKey
    if (key && !overrides.force) {
      const previous = this.lastRequest
      if (previous && previous.key === key && Date.now() - previous.at < DEDUPE_WINDOW_MS) {
        // Same sign, same language, already speaking: do not repeat it.
        return previous.outcome
      }
    }

    const seq = ++this.sequence
    // One speech job at a time. Language switches and new signs cancel the
    // queue instead of stacking up.
    this.stopAllProviders()
    this.patch({
      phase: 'generating',
      language,
      provider: null,
      text,
      error: null,
    })

    let lastOutcome: SpeakOutcome | null = null
    for (const provider of this.providers) {
      let capable = false
      try {
        capable = await provider.supportsLanguage(language)
      } catch {
        capable = false
      }
      // A newer request already took over: abandon this one quietly.
      if (seq !== this.sequence) return supersededOutcome(request)

      if (!capable) continue

      let outcome: SpeakOutcome
      try {
        outcome = await provider.speak(request)
      } catch (error) {
        outcome = {
          ok: false,
          provider: provider.id,
          text,
          language,
          lang: '',
          voiceName: null,
          voiceLang: null,
          voiceMatch: 'unavailable',
          missingVoice: true,
          error: {
            kind: 'request-failed',
            message: error instanceof Error ? error.message : 'The speech provider failed.',
            retryable: true,
          },
        }
      }

      if (seq !== this.sequence) {
        // A newer request took over while this one was in flight. Stop it so
        // two voices never overlap.
        provider.stop()
        return supersededOutcome(request)
      }

      lastOutcome = outcome
      if (outcome.ok) {
        this.patch({ phase: 'speaking', provider: provider.id, error: null })
        if (key) this.lastRequest = { key, at: Date.now(), outcome }
        return outcome
      }
    }

    const error = lastOutcome?.error ?? (await explainNoProvider(language, this.providers))
    const finalOutcome: SpeakOutcome = lastOutcome ?? {
      ok: false,
      provider: null,
      text,
      language,
      lang: '',
      voiceName: null,
      voiceLang: null,
      voiceMatch: 'unavailable',
      missingVoice: true,
      error,
    }

    if (seq !== this.sequence) return finalOutcome
    this.patch({ phase: 'idle', provider: null, error })
    return finalOutcome
  }

  /** Stop everything that could still be making noise. */
  private stopAllProviders(): void {
    for (const provider of this.providers) {
      try {
        provider.stop()
      } catch {
        /* a provider that fails to stop must not break the next request */
      }
    }
  }

  /** Cancel playback and clear any error banner. */
  stop(): void {
    this.sequence += 1
    this.stopAllProviders()
    this.patch({ phase: 'idle', error: null })
  }

  /** Clear a displayed error without stopping playback. */
  clearError(): void {
    if (this.state.error) this.patch({ error: null })
  }

  /**
   * Probe every provider and publish what each language can actually do.
   * Called on mount, on every output-language change, and on a short timer
   * while anything is still unavailable.
   */
  async refreshAvailability(): Promise<SpeechState> {
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      await ensureVoices()
      const availability: Record<SpeechLanguage, boolean> = { en: false, hi: false, kn: false }
      const languages: SpeechLanguage[] = ['en', 'hi', 'kn']
      for (const provider of this.providers) {
        for (const language of languages) {
          if (availability[language]) continue
          try {
            if (await provider.supportsLanguage(language)) availability[language] = true
          } catch {
            /* treat a throwing provider as unusable for this language */
          }
        }
      }
      this.patch({ availability, voicesReady: true })
      this.scheduleRecheck(availability)
      return this.state
    })()
    try {
      return await this.refreshing
    } finally {
      this.refreshing = null
    }
  }

  /**
   * Keep re-probing while a language still has no engine, so starting the
   * service makes speech work on its own without a reload.
   */
  private scheduleRecheck(availability: Record<SpeechLanguage, boolean>): void {
    if (this.recheckTimer) {
      clearTimeout(this.recheckTimer)
      this.recheckTimer = null
    }
    const languages: SpeechLanguage[] = ['en', 'hi', 'kn']
    if (languages.every((language) => availability[language])) return
    const timer = setTimeout(() => {
      this.recheckTimer = null
      void this.refreshAvailability()
    }, RECHECK_INTERVAL_MS)
    // Node (tests, SSR) must still be able to exit while this chain is pending.
    ;(timer as { unref?: () => void }).unref?.()
    this.recheckTimer = timer
  }

  /** Re-read voices and re-probe the local service (Retry button). */
  async retry(): Promise<SpeechState> {
    invalidateVoices()
    for (const provider of this.providers) {
      const invalidate = (provider as { invalidate?: () => void }).invalidate
      if (typeof invalidate === 'function') invalidate()
    }
    this.patch({ error: null })
    return this.refreshAvailability()
  }

  /** Stop the background re-probe timer. */
  dispose(): void {
    if (this.recheckTimer) clearTimeout(this.recheckTimer)
    this.recheckTimer = null
  }
}

/** App-wide controller instance. */
export const ttsController = new TtsController()