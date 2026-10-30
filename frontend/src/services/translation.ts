/**
 * Translation layer for ISL sign output.
 *
 * The model is trained on, and always predicts, ENGLISH class labels
 * ("HELLO", "THANK_YOU", ...). This module is the single place where those
 * internal identifiers are turned into user-facing text.
 *
 * Contract:
 *   internal sign ID  ->  translateSign(id, language)  ->  display text
 *   internal sign IDs ->  speechPlanForSentence(ids, language)
 *
 * Rules:
 *   - Internal IDs are never translated, renamed or replaced.
 *   - The source of truth for a sentence is the list of internal sign IDs,
 *     never a previously translated string. Switching language therefore
 *     re-renders the whole sentence from the IDs.
 *   - Hindi is always Devanagari; Kannada is always Kannada script.
 *     There is no English fallback for hi/kn and no Romanized output.
 */

export type Language = 'en' | 'hi' | 'kn'

/** Alias kept for readability at call sites that talk about output. */
export type OutputLanguage = Language

/**
 * The 20 classes produced by the model (ml/vocabulary.py / models/word_classes.json),
 * plus the explicit word-separator token.
 *
 * These identifiers are the model's contract and must never change.
 */
export type SignId =
  | 'STILL'
  | 'HELLO'
  | 'THANK_YOU'
  | 'GOOD_MORNING'
  | 'GOOD_AFTERNOON'
  | 'WHAT_IS_YOUR_NAME'
  | 'MAYBE'
  | 'COME'
  | 'DRINK'
  | 'GIVE'
  | 'CLEAN'
  | 'COOK'
  | 'CLOSE'
  | 'BREAK'
  | 'POUR'
  | 'CRY'
  | 'JUMP'
  | 'TEA'
  | 'KEY'
  | 'WIFE'
  | 'SPACE'

export interface TranslationEntry {
  /** Model semantic class identifier (e.g. "THANK_YOU"). Never translated. */
  id: SignId
  /** Human-readable English text */
  en: string
  /** Human-readable Hindi text (Devanagari) */
  hi: string
  /** Human-readable Kannada text (Kannada script) */
  kn: string
}

/**
 * BCP-47 tag handed to SpeechSynthesisUtterance.lang.
 * Single source of truth for speech language per output language.
 */
export const TTS_LANGUAGE: Readonly<Record<Language, string>> = {
  en: 'en-US',
  hi: 'hi-IN',
  kn: 'kn-IN',
}

export const DEFAULT_LANGUAGE: Language = 'en'

export const LANGUAGES: readonly Language[] = ['en', 'hi', 'kn']

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'hi' || value === 'kn'
}

/**
 * Complete translation table for every model class.
 *
 * Keep in sync with ml/vocabulary.py ISL_VOCAB.
 *
 * Meaning notes for ambiguous / context-dependent signs:
 *   STILL            - not a word. The backend's "hand is down" pause token
 *                      that terminates a sign. Deliberately empty in all
 *                      languages so it is never displayed or spoken.
 *   CLOSE            - the action verb "close" (as in the dataset's close-a-
 *                      -container gesture), not the adjective.
 *   BREAK            - the action verb "break", as used in the dataset's
 *                      two-handed break gesture. Not "break (rest)".
 *   POUR             - the action verb "pour", as used in the dataset's
 *                      two-handed pouring gesture.
 *   MAYBE            - the hedge word "maybe", not "possibly-or-not".
 *   WHAT_IS_YOUR_NAME- translated as one complete question, not word by word.
 */
export const TRANSLATIONS: readonly TranslationEntry[] = [
  { id: 'STILL', en: '', hi: '', kn: '' },
  { id: 'HELLO', en: 'Hello', hi: 'नमस्ते', kn: 'ನಮಸ್ಕಾರ' },
  { id: 'THANK_YOU', en: 'Thank you', hi: 'धन्यवाद', kn: 'ಧನ್ಯವಾದ' },
  { id: 'GOOD_MORNING', en: 'Good morning', hi: 'सुप्रभात', kn: 'ಶುಭೋದಯ' },
  { id: 'GOOD_AFTERNOON', en: 'Good afternoon', hi: 'शुभ दोपहर', kn: 'ಶುಭ ಮಧ್ಯಾಹ್ನ' },
  { id: 'WHAT_IS_YOUR_NAME', en: 'What is your name?', hi: 'आपका नाम क्या है?', kn: 'ನಿಮ್ಮ ಹೆಸರೇನು?' },
  { id: 'MAYBE', en: 'Maybe', hi: 'शायद', kn: 'ಆಮೋ' },
  { id: 'COME', en: 'Come', hi: 'आओ', kn: 'ಬಾ' },
  { id: 'DRINK', en: 'Drink', hi: 'पियो', kn: 'ಕುಡಿ' },
  { id: 'GIVE', en: 'Give', hi: 'दो', kn: 'ಕೊಡು' },
  { id: 'CLEAN', en: 'Clean', hi: 'साफ करो', kn: 'ಸ್ವಚ್ಛ ಮಾಡಿ' },
  { id: 'COOK', en: 'Cook', hi: 'पकाओ', kn: 'ಒಡಿ' },
  { id: 'CLOSE', en: 'Close', hi: 'बंद करो', kn: 'ಮುಚ್ಚಿ' },
  { id: 'BREAK', en: 'Break', hi: 'तोड़ो', kn: 'ತೋಡಿ' },
  { id: 'POUR', en: 'Pour', hi: 'डालो', kn: 'ಹಾಕಿ' },
  { id: 'CRY', en: 'Cry', hi: 'रोओ', kn: 'ಅಳು' },
  { id: 'JUMP', en: 'Jump', hi: 'कूदो', kn: 'ಕೂಡು' },
  { id: 'TEA', en: 'Tea', hi: 'चाय', kn: 'ಚಹಾ' },
  { id: 'KEY', en: 'Key', hi: 'चाबी', kn: 'ಕೀಲಿ' },
  { id: 'WIFE', en: 'Wife', hi: 'पत्नी', kn: 'ಪತ್ನಿ' },
  { id: 'SPACE', en: ' ', hi: ' ', kn: ' ' },
] as const

/** Lookup map for O(1) access. */
export const TRANSLATION_MAP: ReadonlyMap<string, TranslationEntry> = new Map(
  TRANSLATIONS.map((entry) => [entry.id, entry]),
)

/**
 * Narrow an arbitrary string to a known model class identifier.
 * Returns null for unknown values so callers can react instead of guessing.
 */
export function parseSignId(value: string): SignId | null {
  return TRANSLATION_MAP.has(value) ? (value as SignId) : null
}

/**
 * Translate one internal sign ID into the requested output language.
 *
 * Returns '' for STILL/empty entries (they are never displayed or spoken).
 * For an unknown ID this is a programming error upstream; we return the
 * humanised identifier rather than leaking raw English into a hi/kn sentence,
 * and callers filter such entries out.
 */
export function translateSign(signId: string, lang: Language): string {
  const entry = TRANSLATION_MAP.get(signId)
  if (!entry) return ''
  return entry[lang]
}

/**
 * Translate a whole sentence from its internal sign IDs.
 *
 * This is the ONLY function used to build the visible sentence, so a language
 * switch always re-derives the text from the stored IDs instead of translating
 * an already-translated string.
 */
export function translateSentence(signIds: readonly string[], lang: Language): string {
  return signIds
    .map((id) => translateSign(id, lang))
    .filter((text) => text.trim().length > 0 || text === ' ')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** BCP-47 speech tag for an output language (e.g. 'hi-IN'). */
export function getTtsLang(_signId: string, lang: Language): string {
  return TTS_LANGUAGE[lang] ?? TTS_LANGUAGE.en
}

export interface SpeechPlan {
  /** Translated text to hand to the speech engine. Never an English label. */
  text: string
  /** BCP-47 tag for SpeechSynthesisUtterance.lang. */
  lang: string
  /** The internal IDs this plan was built from (useful for tests/debugging). */
  signIds: readonly string[]
}

/** Speech plan for a single accepted sign (used by auto-speak). */
export function speechPlanForSign(signId: string, lang: Language): SpeechPlan {
  return {
    text: translateSign(signId, lang),
    lang: TTS_LANGUAGE[lang] ?? TTS_LANGUAGE.en,
    signIds: [signId],
  }
}

/** Speech plan for the whole sentence (used by the Speak button). */
export function speechPlanForSentence(
  signIds: readonly string[],
  lang: Language,
): SpeechPlan {
  return {
    text: translateSentence(signIds, lang),
    lang: TTS_LANGUAGE[lang] ?? TTS_LANGUAGE.en,
    signIds: [...signIds],
  }
}

export const SUPPORTED_LANGUAGES: readonly {
  code: Language
  label: string
  nativeLabel: string
}[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
] as const

/** localStorage key for the selected output language. */
export const LANGUAGE_STORAGE_KEY = 'isl-output-language'

/** Load saved language, defaulting to English. */
export function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_LANGUAGE
}

/** Persist the selected language. */
export function saveLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
  } catch {
    /* storage unavailable */
  }
}