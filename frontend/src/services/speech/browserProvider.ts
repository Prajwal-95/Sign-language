/**
 * Browser speech provider — the Web Speech API (`window.speechSynthesis`).
 *
 * This is the first provider tried for every language. It is free and already
 * installed, but it can only speak languages whose voices the operating system
 * exposes. On a default Windows 11 install that means English only, so Hindi
 * and Kannada usually fall through to the local provider.
 *
 * Rules enforced here:
 *   - the voice list is resolved asynchronously (empty on first read in most
 *     browsers) and refreshed on `voiceschanged`;
 *   - voices are matched on normalised BCP-47 tags, exact before prefix;
 *   - a voice is NEVER borrowed across languages — an English voice is never
 *     used for Hindi or Kannada, even when the user picked it in Settings;
 *   - when no matching voice exists, nothing is dispatched at all: pretending
 *     to speak is worse than an honest "this device cannot do that yet".
 */

import { languageForTag, normaliseTag, speechTag, tagPrefix, tagsMatch } from './bcp47.ts'
import { readSpeechSettings } from './settings.ts'
import type {
  ProviderId,
  SpeakOutcome,
  SpeakRequest,
  SpeechLanguage,
  TtsError,
  TtsProvider,
  VoiceMatch,
} from './types.ts'

/** Minimal voice shape, so tests can supply a plain list. */
export interface VoiceLike {
  name: string
  lang: string
}

export interface SpeakOptions {
  rate?: number
  pitch?: number
  /** BCP-47 tag. Defaults to the tag for 'en-US'. */
  lang?: string
}

/** Legacy synchronous result shape, kept for existing call sites. */
export interface SpeakResult {
  ok: boolean
  text: string
  lang: string
  voiceName: string | null
  voiceLang: string | null
  voiceMatch: VoiceMatch
  missingVoice: boolean
  error?: TtsError
}

const VOICE_WAIT_MS = 3000
const VOICE_POLL_MS = 100
/** How long to wait for the engine to confirm playback actually began. */
const START_GRACE_MS = 900

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function synthAvailable(): boolean {
  return speechSupported() && typeof SpeechSynthesisUtterance !== 'undefined'
}

/**
 * Pick the best voice for `targetLang`.
 *
 * An explicitly configured voice is only honoured when it can actually speak
 * the requested language — that closes the "English voice silently reading
 * Devanagari" hole the old implementation had.
 */
export function selectVoice(
  voices: readonly VoiceLike[],
  targetLang: string,
  explicitName?: string | null,
): { voice: VoiceLike | null; match: VoiceMatch } {
  if (explicitName) {
    const explicit = voices.find((v) => v.name === explicitName)
    // Never attach a voice from another language, not even a user-chosen one.
    if (explicit && tagsMatch(explicit.lang, targetLang)) return { voice: explicit, match: 'explicit' }
  }

  if (voices.length === 0) return { voice: null, match: 'platform-default' }

  const wanted = normaliseTag(targetLang)
  const prefix = tagPrefix(targetLang)

  const exact = voices.find((v) => normaliseTag(v.lang) === wanted)
  if (exact) return { voice: exact, match: 'exact' }

  const byPrefix = voices.find((v) => tagPrefix(v.lang) === prefix)
  if (byPrefix) return { voice: byPrefix, match: 'prefix' }

  // No suitable voice. Callers decide what to do; we never fall back to a
  // foreign voice.
  return { voice: null, match: 'unavailable' }
}

let cachedVoices: SpeechSynthesisVoice[] | null = null
let voiceWaiters: Array<(voices: SpeechSynthesisVoice[]) => void> = []
let listenerInstalled = false

/**
 * Keep the cache honest across installs: when the OS publishes a new voice
 * list, drop the stale cache and notify everyone waiting on it.
 */
function ensureListener(): void {
  if (listenerInstalled || !speechSupported()) return
  listenerInstalled = true
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    const list = window.speechSynthesis.getVoices()
    cachedVoices = list.length > 0 ? list : null
    const waiters = voiceWaiters
    voiceWaiters = []
    for (const waiter of waiters) waiter(list)
  })
}

/** Voices matching a language prefix (e.g. 'hi' matches 'hi-IN'). */
export function getVoicesForLang(langPrefixOrTag: string): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  const voices = cachedVoices ?? window.speechSynthesis.getVoices()
  const prefix = tagPrefix(langPrefixOrTag)
  return voices.filter((v) => tagPrefix(v.lang) === prefix)
}

/** True when the browser exposes at least one voice for the language prefix. */
export function hasVoiceForLang(langPrefixOrTag: string): boolean {
  return getVoicesForLang(langPrefixOrTag).length > 0
}

/**
 * Resolve the browser voice list.
 *
 * Chrome and Edge populate it asynchronously, so the first `getVoices()` call
 * often returns []. We therefore wait for `voiceschanged`, poll as a fallback
 * (some engines never fire the event) and give up after `timeoutMs` with
 * whatever exists at that point — an empty list is a valid answer meaning
 * "this device exposes no voices", and it is cached so we never block twice.
 */
export function loadVoices(timeoutMs: number = VOICE_WAIT_MS): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  ensureListener()

  const synth = window.speechSynthesis
  const immediate = synth.getVoices()
  if (immediate.length > 0) {
    cachedVoices = immediate
    return Promise.resolve(immediate)
  }
  // Already resolved empty and nothing has changed: do not block again.
  if (cachedVoices) return Promise.resolve(cachedVoices)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      const list = synth.getVoices()
      // Keep waiting while the list is still empty and time is left: an empty
      // list usually means "not loaded yet", not "no voices installed".
      if (list.length === 0 && Date.now() - startedAt < timeoutMs - VOICE_POLL_MS / 2) return
      settled = true
      clearTimeout(timer)
      clearInterval(poll)
      synth.removeEventListener?.('voiceschanged', finish)
      cachedVoices = list
      const waiters = voiceWaiters
      voiceWaiters = []
      for (const waiter of waiters) waiter(list)
      resolve(list)
    }
    const startedAt = Date.now()
    const timer = setTimeout(finish, timeoutMs)
    const poll = setInterval(finish, VOICE_POLL_MS)
    synth.addEventListener?.('voiceschanged', finish)
  })
}

/** Drop the cached list so the next read re-reads it (e.g. after an install). */
export function invalidateVoices(): void {
  cachedVoices = null
}

/** Resolve the voice list and cache it. Safe to call on every mount. */
export async function ensureVoices(timeoutMs: number = VOICE_WAIT_MS): Promise<SpeechSynthesisVoice[]> {
  return loadVoices(timeoutMs)
}

/** Subscribe to browser voice-list changes. Returns an unsubscribe function. */
export function onVoicesChanged(handler: () => void): () => void {
  if (!speechSupported()) return () => {}
  ensureListener()
  voiceWaiters.push(() => handler())
  const wrapped = () => {
    invalidateVoices()
    handler()
  }
  window.speechSynthesis.addEventListener?.('voiceschanged', wrapped)
  return () => {
    window.speechSynthesis.removeEventListener?.('voiceschanged', wrapped)
    voiceWaiters = voiceWaiters.filter((h) => h !== wrapped)
  }
}

function resolveRatePitch(opts: SpeakOptions): { rate: number; pitch: number; voiceName: string | null } {
  const stored = readSpeechSettings()
  return {
    rate: opts.rate ?? stored.rate,
    pitch: opts.pitch ?? stored.pitch,
    voiceName: stored.voice,
  }
}

interface UtteranceObserver {
  onStart?: () => void
  onEnd?: () => void
  onError?: (code: string) => void
}

function emptyResult(text: string, lang: string, error?: TtsError): SpeakResult {
  return {
    ok: false,
    text,
    lang,
    voiceName: null,
    voiceLang: null,
    voiceMatch: 'unavailable',
    missingVoice: true,
    error,
  }
}

/**
 * Speak text with a native browser voice.
 *
 * Synchronous by design: the utterance is dispatched (or deliberately not
 * dispatched) before this returns, so callers can inspect the result without
 * waiting for playback to finish.
 */
export function speakDetailed(text: string, opts: SpeakOptions = {}): SpeakResult {
  return dispatchUtterance(text, opts).result
}

/** Speak text aloud. Returns true when speech was dispatched with a usable voice. */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  return speakDetailed(text, opts).ok
}

function dispatchUtterance(
  text: string,
  opts: SpeakOptions,
  observer?: UtteranceObserver,
): { result: SpeakResult; utterance: SpeechSynthesisUtterance | null } {
  const targetLang = opts.lang ?? 'en-US'
  const language = languageForTag(targetLang)
  const { rate, pitch, voiceName } = resolveRatePitch(opts)

  if (!text || !text.trim()) {
    return {
      result: emptyResult(text, targetLang, {
        kind: 'empty-text',
        message: 'There is nothing to read aloud yet.',
        retryable: false,
      }),
      utterance: null,
    }
  }

  if (!synthAvailable()) {
    return {
      result: emptyResult(text, targetLang, {
        kind: 'browser-unsupported',
        message: 'This browser does not provide a speech engine.',
        action: 'Use a current version of Chrome or Edge on this device.',
        retryable: false,
      }),
      utterance: null,
    }
  }

  const synth = window.speechSynthesis
  synth.cancel() // never queue stale audio

  const { voice, match } = selectVoice(synth.getVoices(), targetLang, voiceName)

  // English may fall back to the platform default (that is what the OS voice
  // for 'en' is). Hindi and Kannada may not: an English voice reading Devanagari
  // or Kannada script produces noise, so we refuse and let the caller fall back.
  const isEnglish = language === 'en'
  if (!voice && !isEnglish) {
    return {
      result: emptyResult(text, targetLang, {
        kind: 'no-voice',
        message: 'This device has no browser voice for the selected language.',
        action: 'Start the local speech service to synthesise it offline.',
        retryable: true,
      }),
      utterance: null,
    }
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.volume = 1
  // Always set the correct locale, even when relying on the platform default.
  utterance.lang = targetLang
  if (voice) utterance.voice = voice as SpeechSynthesisVoice

  if (observer) {
    utterance.onstart = () => observer.onStart?.()
    utterance.onend = () => observer.onEnd?.()
    utterance.onerror = (event: Event) => {
      const code = (event as Event & { error?: string }).error ?? 'unknown'
      observer.onError?.(code)
    }
  }

  try {
    synth.speak(utterance)
  } catch {
    return {
      result: {
        ...emptyResult(text, targetLang, {
          kind: 'request-failed',
          message: 'The speech engine rejected the request.',
          retryable: true,
        }),
        voiceMatch: match,
      },
      utterance: null,
    }
  }

  return {
    result: {
      ok: true,
      text,
      lang: targetLang,
      voiceName: voice?.name ?? null,
      voiceLang: voice?.lang ?? null,
      voiceMatch: match,
      missingVoice: false,
    },
    utterance,
  }
}

/** Cancel anything the browser is currently saying. */
export function stopSpeech(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

const BROWSER_ERRORS: Readonly<Record<string, string>> = {
  canceled: 'Speech was cancelled.',
  interrupted: 'Speech was interrupted.',
  'voice-unavailable': 'The selected voice is not available on this device.',
  'language-unavailable': 'The selected language is not available on this device.',
  'text-too-long': 'The text is too long to read in one go.',
  'synthesis-unavailable': 'The speech engine could not start.',
  'synthesis-failed': 'The speech engine failed while speaking.',
}

export class BrowserTtsProvider implements TtsProvider {
  readonly id: ProviderId = 'browser'
  readonly label = 'Browser speech (Web Speech API)'
  /**
   * The Web Speech API ships every system voice, so it *may* speak any of the
   * three languages. Whether a voice actually exists is decided per request by
   * `supportsLanguage`, never assumed.
   */
  readonly languages: readonly SpeechLanguage[] = ['en', 'hi', 'kn']

  /** Fired when an utterance finishes or fails after `speak()` resolved. */
  onEnded: (() => void) | null = null
  onFailure: ((error: TtsError) => void) | null = null

  async isUsable(): Promise<boolean> {
    if (!synthAvailable()) return false
    await loadVoices(400)
    return true
  }

  async supportsLanguage(language: SpeechLanguage): Promise<boolean> {
    if (!this.languages.includes(language)) return false
    if (!synthAvailable()) return false
    const voices = await loadVoices()
    if (voices.length === 0) return language === 'en'
    return selectVoice(voices, speechTag(language)).match !== 'unavailable'
  }

  async speak(request: SpeakRequest): Promise<SpeakOutcome> {
    const tag = speechTag(request.language)
    const base: SpeakOutcome = {
      ok: false,
      provider: this.id,
      text: request.text,
      language: request.language,
      lang: tag,
      voiceName: null,
      voiceLang: null,
      voiceMatch: 'unavailable',
      missingVoice: true,
      error: null,
    }

    if (!request.text.trim()) {
      return {
        ...base,
        error: { kind: 'empty-text', message: 'There is nothing to read aloud yet.', retryable: false },
      }
    }

    // Make sure we are not deciding on an empty, not-yet-loaded voice list.
    await loadVoices()

    // Watch the utterance for the whole of its life: `start` settles the call,
    // `end` / `error` keep the controller's state accurate afterwards.
    let settled = false
    let resolveStarted!: (value: { ok: boolean; error: TtsError | null }) => void
    const started = new Promise<{ ok: boolean; error: TtsError | null }>((resolve) => {
      resolveStarted = resolve
    })

    const observer: UtteranceObserver = {
      onStart: () => {
        if (!settled) {
          settled = true
          resolveStarted({ ok: true, error: null })
        }
      },
      onEnd: () => {
        if (!settled) {
          settled = true
          resolveStarted({ ok: true, error: null })
        }
        this.onEnded?.()
      },
      onError: (code) => {
        // A cancel is the user pressing Stop, not a failure.
        if (code === 'canceled' || code === 'interrupted') {
          if (!settled) {
            settled = true
            resolveStarted({ ok: true, error: null })
          }
          return
        }
        const error: TtsError = {
          kind: 'request-failed',
          message: BROWSER_ERRORS[code] ?? 'The browser speech engine reported an error.',
          retryable: true,
        }
        if (!settled) {
          settled = true
          resolveStarted({ ok: false, error })
        }
        this.onFailure?.(error)
      },
    }

    const opts: SpeakOptions = { lang: tag, rate: request.rate, pitch: request.pitch }
    const { result } = dispatchUtterance(request.text, opts, observer)

    if (!result.ok) {
      return {
        ...base,
        lang: result.lang,
        voiceMatch: result.voiceMatch,
        error: result.error ?? {
          kind: 'no-voice',
          message: 'This device has no browser voice for the selected language.',
          retryable: true,
        },
      }
    }

    // Give the engine a moment to actually start or fail. Browsers that
    // silently drop an utterance never fire `start` at all, so we stop waiting
    // after a short grace period and report what we honestly know.
    const verdict = await Promise.race([
      started,
      new Promise<{ ok: boolean; error: TtsError | null }>((resolve) =>
        setTimeout(() => resolve({ ok: true, error: null }), START_GRACE_MS),
      ),
    ])

    if (!verdict.ok) {
      return { ...base, lang: result.lang, voiceMatch: result.voiceMatch, error: verdict.error }
    }

    return {
      ok: true,
      provider: this.id,
      text: result.text,
      language: request.language,
      lang: result.lang,
      voiceName: result.voiceName,
      voiceLang: result.voiceLang,
      voiceMatch: result.voiceMatch,
      missingVoice: false,
      error: null,
    }
  }

  stop(): void {
    stopSpeech()
  }
}

export const browserTtsProvider = new BrowserTtsProvider()