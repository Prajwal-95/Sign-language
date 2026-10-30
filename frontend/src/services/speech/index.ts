/**
 * Public surface of the speech layer.
 *
 * The app talks to the controller (`ttsController` / `useSpeech`) for anything
 * user-facing. The Web Speech API helpers are re-exported for Settings, which
 * needs the raw voice list.
 */

export type {
  ProviderId,
  SpeakOutcome,
  SpeakPhase,
  SpeakRequest,
  SpeechLanguage,
  SpeechState,
  TtsError,
  TtsErrorKind,
  TtsProvider,
  VoiceMatch,
} from './types.ts'

export {
  LANGUAGE_LABELS,
  isSpeechLanguage,
  languageForTag,
  normaliseTag,
  speechTag,
  tagPrefix,
  tagsMatch,
} from './bcp47.ts'

export {
  DEFAULT_SPEECH_SETTINGS,
  SETTINGS_STORAGE_KEY,
  readSpeechSettings,
  type SpeechSettings,
} from './settings.ts'

export {
  BrowserTtsProvider,
  browserTtsProvider,
  ensureVoices,
  getVoicesForLang,
  hasVoiceForLang,
  invalidateVoices,
  loadVoices,
  onVoicesChanged,
  selectVoice,
  speak,
  speakDetailed,
  speechSupported,
  stopSpeech,
  type SpeakOptions,
  type SpeakResult,
  type VoiceLike,
} from './browserProvider.ts'

export {
  DEFAULT_LOCAL_TTS_URL,
  LocalTtsProvider,
  localTtsProvider,
  resolveLocalTtsUrl,
  type AudioLike,
  type HealthPayload,
  type LocalTtsOptions,
} from './localProvider.ts'

export {
  DEDUPE_WINDOW_MS,
  TtsController,
  ttsController,
  type SpeakOverrides,
} from './controller.ts'