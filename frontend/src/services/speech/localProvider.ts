/**
 * Local speech provider — a small offline TTS service on this machine.
 *
 * Windows 11 ships English voices only, so the browser provider cannot read
 * Hindi or Kannada out of the box. This provider talks to a loopback HTTP
 * service (`tools/tts-service/`) that runs a neural, offline engine for both
 * languages and returns WAV bytes. Nothing leaves the machine; no account,
 * subscription or API key is involved.
 *
 * Everything platform-specific is dependency-injected (fetch, Audio, object
 * URLs) so the whole provider is exercisable in unit tests without a DOM.
 *
 * Contract with the service:
 *   GET  /health -> { ok: true, engines: { en: string|null, hi: ..., kn: ... } }
 *   POST /speak  { text, lang, tag, rate, pitch } -> audio/wav
 */

import { LANGUAGE_LABELS, speechTag } from './bcp47.ts'
import { readSpeechSettings } from './settings.ts'
import type {
  ProviderId,
  SpeakOutcome,
  SpeakRequest,
  SpeechLanguage,
  TtsError,
  TtsProvider,
} from './types.ts'

export const DEFAULT_LOCAL_TTS_URL = 'http://127.0.0.1:8765'
const HEALTH_TIMEOUT_MS = 2500
/**
 * Generous, because a neural engine may still be loading a model the first
 * time. The service pre-loads on start-up, so this is only a safety net.
 */
const SPEAK_TIMEOUT_MS = 45_000
const PROBE_TTL_MS = 30_000
/**
 * A failed probe is remembered only briefly. The service takes a few seconds to
 * open its port, and a user often starts it *after* opening the app, so a long
 * failure cache would keep reporting "service offline" long after it is up.
 */
const FAILURE_BACKOFF_MS = 2_000

export interface HealthPayload {
  ok?: boolean
  engines?: Partial<Record<SpeechLanguage, string | null>>
  version?: string
}

/** The subset of HTMLAudioElement this provider uses. */
export interface AudioLike {
  src: string
  currentTime: number
  play(): Promise<void> | void
  pause(): void
  addEventListener(type: string, handler: () => void): void
  removeEventListener(type: string, handler: () => void): void
}

export interface LocalTtsOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  audioFactory?: () => AudioLike | null
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  probeTtlMs?: number
}

/** Loopback address of the service, overridable at build time. */
export function resolveLocalTtsUrl(): string {
  const fromEnv = import.meta.env?.VITE_LOCAL_TTS_URL
  const trimmed = typeof fromEnv === 'string' ? fromEnv.trim() : ''
  return trimmed || DEFAULT_LOCAL_TTS_URL
}

function defaultAudioFactory(): AudioLike | null {
  if (typeof Audio === 'undefined') return null
  return new Audio() as unknown as AudioLike
}

function defaultCreateObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

function defaultRevokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url)
}

function timeoutError(ms: number): TtsError {
  return {
    kind: 'request-failed',
    message: `The local speech service did not answer within ${Math.round(ms / 1000)}s.`,
    action: 'Its models may still be loading. Press Speak again in a moment.',
    retryable: true,
  }
}

const OFFLINE_ERROR: TtsError = {
  kind: 'service-offline',
  message: 'The local speech service is not running.',
  action: 'Start it with tools\\tts-service\\run.bat, then press Speak again.',
  retryable: true,
}

/**
 * Speak Hindi and Kannada (and optionally English) through a local offline
 * service. Never claims success: every failure path returns an honest error.
 */
export class LocalTtsProvider implements TtsProvider {
  readonly id: ProviderId = 'local'
  readonly label = 'Local speech service (offline)'
  readonly languages: readonly SpeechLanguage[] = ['en', 'hi', 'kn']

  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly audioFactory: () => AudioLike | null
  private readonly createObjectUrl: (blob: Blob) => string
  private readonly revokeObjectUrl: (url: string) => void
  private readonly probeTtlMs: number

  private health: HealthPayload | null = null
  private probedAt = 0
  private failedAt = 0
  private probing: Promise<HealthPayload | null> | null = null
  private audio: AudioLike | null = null
  private detachAudio: (() => void) | null = null
  private inflight: AbortController | null = null

  /** Called when playback finishes or fails after `speak()` resolved. */
  onEnded: (() => void) | null = null
  onFailure: ((error: TtsError) => void) | null = null

  constructor(options: LocalTtsOptions = {}) {
    this.baseUrl = (options.baseUrl ?? resolveLocalTtsUrl()).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
    this.audioFactory = options.audioFactory ?? defaultAudioFactory
    this.createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl
    this.revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl
    this.probeTtlMs = options.probeTtlMs ?? PROBE_TTL_MS
  }

  /** Forget the cached probe so the next call re-checks the service. */
  invalidate(): void {
    this.health = null
    this.probedAt = 0
    this.failedAt = 0
  }

  private runProbe(): Promise<HealthPayload | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    this.probing = (async () => {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
          // Loopback service: no cookies and no ambient credentials are sent.
          credentials: 'omit',
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = (await response.json()) as HealthPayload
        if (payload && payload.ok === false) throw new Error('service reported ok=false')
        this.health = payload ?? null
        this.probedAt = Date.now()
        this.failedAt = 0
        return this.health
      } catch {
        this.health = null
        this.failedAt = Date.now()
        return null
      } finally {
        clearTimeout(timer)
        this.probing = null
      }
    })()
    return this.probing
  }

  private probe(force = false): Promise<HealthPayload | null> {
    if (force) return this.runProbe()
    if (this.health && Date.now() - this.probedAt < this.probeTtlMs) {
      return Promise.resolve(this.health)
    }
    // Only a short back-off after a failure, so a service that is still booting
    // (or is started a moment later) is picked up within a couple of seconds.
    if (!this.health && Date.now() - this.failedAt < FAILURE_BACKOFF_MS) {
      return Promise.resolve(null)
    }
    if (this.probing) return this.probing
    return this.runProbe()
  }

  async isUsable(): Promise<boolean> {
    return (await this.probe()) !== null
  }

  async supportsLanguage(language: SpeechLanguage): Promise<boolean> {
    if (!this.languages.includes(language)) return false
    const health = await this.probe()
    if (!health) return false
    const engine = health.engines?.[language]
    return typeof engine === 'string' && engine.length > 0
  }

  /** Engine name the service reports for a language, or null. */
  async engineFor(language: SpeechLanguage): Promise<string | null> {
    const health = await this.probe()
    return health?.engines?.[language] ?? null
  }

  async speak(request: SpeakRequest): Promise<SpeakOutcome> {
    const base: SpeakOutcome = {
      ok: false,
      provider: this.id,
      text: request.text,
      language: request.language,
      lang: speechTag(request.language),
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

    const health = await this.probe()
    if (!health) {
      return { ...base, error: { ...OFFLINE_ERROR } }
    }

    const engine = health.engines?.[request.language]
    if (!engine) {
      return {
        ...base,
        error: {
          kind: 'unsupported-language',
          message: `The local speech service has no ${LANGUAGE_LABELS[request.language]} engine installed.`,
          action: 'Run tools\\tts-service\\install.bat to download the voice model.',
          retryable: false,
          needsNetwork: true,
        },
      }
    }

    this.stop()

    const stored = readSpeechSettings()
    const controller = new AbortController()
    this.inflight = controller
    const timer = setTimeout(() => controller.abort(), SPEAK_TIMEOUT_MS)

    let blob: Blob
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          text: request.text,
          lang: request.language,
          tag: base.lang,
          rate: request.rate ?? stored.rate,
          pitch: request.pitch ?? stored.pitch,
        }),
        signal: controller.signal,
      })

      if (response.status === 404) {
        return {
          ...base,
          error: {
            kind: 'unsupported-language',
            message: `The local speech service cannot speak ${LANGUAGE_LABELS[request.language]}.`,
            retryable: false,
          },
        }
      }
      if (!response.ok) {
        // The service replies with JSON { ok:false, error } on failure.
        // Surface that message verbatim — it is written for the user and
        // explains the real cause (wrong script, missing model, crash).
        let detail: string | null = null
        try {
          const body = (await response.json()) as { error?: string }
          if (typeof body.error === 'string' && body.error.trim()) detail = body.error.trim()
        } catch {
          /* not JSON — fall back to the generic status message */
        }
        const scriptMismatch = detail?.toLowerCase().includes('script') ?? false
        return {
          ...base,
          error: {
            kind: 'request-failed',
            message: detail
              ? `The local speech service could not produce audio: ${detail}`
              : `The local speech service returned HTTP ${response.status}.`,
            action: scriptMismatch
              ? 'The text does not match the selected language. Re-translate, then press Speak again.'
              : 'Check the service window for an error message.',
            retryable: !scriptMismatch,
          },
        }
      }

      const contentType = response.headers?.get?.('content-type') ?? ''
      if (!contentType.startsWith('audio/')) {
        return {
          ...base,
          error: {
            kind: 'request-failed',
            message: 'The local speech service did not return audio.',
            retryable: true,
          },
        }
      }

      blob = await response.blob()
      if (!blob || blob.size === 0) {
        return {
          ...base,
          error: {
            kind: 'request-failed',
            message: 'The local speech service produced an empty audio file.',
            retryable: true,
          },
        }
      }
    } catch {
      if (controller.signal.aborted) return { ...base, error: timeoutError(SPEAK_TIMEOUT_MS) }
      this.invalidate()
      return {
        ...base,
        error: {
          kind: 'service-offline',
          message: 'Lost contact with the local speech service.',
          action: 'Confirm it is still running, then press Speak again.',
          retryable: true,
        },
      }
    } finally {
      clearTimeout(timer)
      this.inflight = null
    }

    const playback = await this.play(blob)
    if (!playback.ok && playback.error) return { ...base, error: playback.error }

    return {
      ok: true,
      provider: this.id,
      text: request.text,
      language: request.language,
      lang: base.lang,
      voiceName: engine,
      voiceLang: base.lang,
      voiceMatch: 'exact',
      missingVoice: false,
      error: null,
    }
  }

  private async play(blob: Blob): Promise<{ ok: boolean; error?: TtsError }> {
    let audio: AudioLike | null = null
    try {
      audio = this.audioFactory()
    } catch {
      audio = null
    }
    if (!audio) {
      return {
        ok: false,
        error: {
          kind: 'playback-failed',
          message: 'This browser cannot play the generated audio.',
          retryable: false,
        },
      }
    }

    let url: string
    try {
      url = this.createObjectUrl(blob)
    } catch {
      return {
        ok: false,
        error: {
          kind: 'playback-failed',
          message: 'The generated audio could not be prepared for playback.',
          retryable: true,
        },
      }
    }

    const handleEnded = () => {
      this.detach()
      this.onEnded?.()
    }
    const handleError = () => {
      this.detach()
      this.onFailure?.({
        kind: 'playback-failed',
        message: 'The browser could not play the generated audio.',
        action: 'Press Speak again.',
        retryable: true,
      })
    }

    audio.src = url
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    this.detachAudio = () => {
      audio!.removeEventListener('ended', handleEnded)
      audio!.removeEventListener('error', handleError)
      this.revokeObjectUrl(url)
    }
    this.audio = audio

    // `play()` rejecting is the browser refusing to start audio (autoplay
    // policy, no output device). That is a failure, not a success we report
    // optimistically, so it is resolved here rather than swallowed.
    try {
      const played = audio.play()
      if (played && typeof (played as Promise<void>).then === 'function') {
        await played
      }
    } catch (reason) {
      const name = (reason as { name?: string } | null)?.name ?? ''
      this.detach()
      return {
        ok: false,
        error: {
          kind: 'playback-failed',
          message:
            name === 'NotAllowedError'
              ? 'The browser blocked audio playback.'
              : 'The browser could not play the generated audio.',
          action:
            name === 'NotAllowedError'
              ? 'Press Speak once more — browsers only allow audio after a click.'
              : 'Check that this device has a working audio output, then try again.',
          retryable: true,
        },
      }
    }

    return { ok: true }
  }

  /** Detach listeners, revoke the object URL and forget the element. */
  private detach(): void {
    const detach = this.detachAudio
    this.detachAudio = null
    this.audio = null
    if (detach) detach()
  }

  stop(): void {
    this.inflight?.abort()
    this.inflight = null
    const audio = this.audio
    if (audio) {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {
        /* element already detached */
      }
    }
    this.detach()
  }
}

export const localTtsProvider = new LocalTtsProvider()