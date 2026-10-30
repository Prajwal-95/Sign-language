/**
 * Shared vocabulary for the speech layer.
 *
 * A provider is anything that can turn `(text, language)` into audible output.
 * Two exist today:
 *
 *   browser — the Web Speech API (`speechSynthesis`). Free, already installed,
 *             but it can only speak languages whose voices the OS exposes.
 *   local   — a small speech service on this machine (see `tools/tts-service`)
 *             that synthesises Hindi and Kannada offline with neural voices.
 *
 * Both declare exactly which languages they can speak. Nothing here assumes an
 * installed voice can pronounce an arbitrary language.
 */

import type { Language } from '../translation.ts'

/** Languages the product can speak (single source of truth: translation.ts). */
export type SpeechLanguage = Language

/** Identifier of a speech provider, stable across releases. */
export type ProviderId = 'browser' | 'local'

/** What the speech controller is doing right now. */
export type SpeakPhase = 'idle' | 'generating' | 'speaking'

/** How a voice was chosen for an utterance. */
export type VoiceMatch = 'explicit' | 'exact' | 'prefix' | 'platform-default' | 'unavailable'

export type TtsErrorKind =
  /** Nothing was asked to be said. */
  | 'empty-text'
  /** The browser has no speechSynthesis at all. */
  | 'browser-unsupported'
  /** The browser exposes voices but none for this language. */
  | 'no-voice'
  /** The local speech service is not running / not reachable. */
  | 'service-offline'
  /** A provider answered, but has no engine for this language. */
  | 'unsupported-language'
  /** The provider was reachable but the request failed. */
  | 'request-failed'
  /** Audio was produced but the browser refused to play it. */
  | 'playback-failed'
  /** A newer request replaced this one before it could finish. */
  | 'superseded'

export interface TtsError {
  kind: TtsErrorKind
  /** Short, honest sentence describing what actually went wrong. */
  message: string
  /** Concrete next step for the user. Omitted when nothing helps. */
  action?: string
  /** True when simply trying again could succeed without user action. */
  retryable: boolean
  /** True when producing this speech requires an internet connection. */
  needsNetwork?: boolean
}

/** One speech job. The controller accepts translated text + output language. */
export interface SpeakRequest {
  /** Translated output text. Never a model class identifier. */
  text: string
  language: SpeechLanguage
  rate?: number
  pitch?: number
  /**
   * When set, an identical key arriving within the dedupe window is dropped
   * instead of being spoken twice. Used by auto-speak so repeated WebSocket
   * predictions for the same sign cannot replay the same word.
   */
  dedupeKey?: string
}

/** Result of one speech job. `ok === false` always carries an `error`. */
export interface SpeakOutcome {
  ok: boolean
  /** Provider that produced the audio, or null when none could. */
  provider: ProviderId | null
  /** Exact text handed to the engine. */
  text: string
  language: SpeechLanguage
  /** BCP-47 tag handed to the engine. */
  lang: string
  voiceName: string | null
  voiceLang: string | null
  voiceMatch: VoiceMatch
  /** True when no engine exists for the requested language. */
  missingVoice: boolean
  error: TtsError | null
}

export interface TtsProvider {
  readonly id: ProviderId
  /** Human-readable name shown in Settings. */
  readonly label: string
  /** Languages this provider declares it can synthesise. */
  readonly languages: readonly SpeechLanguage[]
  /** Is the provider present and functional in this environment? */
  isUsable(): Promise<boolean>
  /** Can this provider speak `language` right now? */
  supportsLanguage(language: SpeechLanguage): Promise<boolean>
  /** Produce and play speech. Resolves once playback has started. */
  speak(request: SpeakRequest): Promise<SpeakOutcome>
  /** Stop playback and abandon any queued work. */
  stop(): void
  /** Optional lifecycle hooks, implemented by providers that play audio. */
  onEnded?: (() => void) | null
  onFailure?: ((error: TtsError) => void) | null
}

/** Observable state published by the controller. */
export interface SpeechState {
  phase: SpeakPhase
  /** Language of the most recent request. */
  language: SpeechLanguage | null
  provider: ProviderId | null
  /** Text currently being generated or spoken. */
  text: string
  error: TtsError | null
  /** Per-language capability, filled in by `refreshAvailability()`. */
  availability: Record<SpeechLanguage, boolean>
  /** True once the browser voice list has been resolved (empty list is valid). */
  voicesReady: boolean
}