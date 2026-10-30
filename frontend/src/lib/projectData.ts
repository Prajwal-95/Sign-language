/**
 * Verified project facts used across marketing / informational surfaces.
 *
 * Every number here is traceable to a file in this repository. Nothing in this
 * module is invented: if a value cannot be verified from the repo or from the
 * live backend, it does not belong here.
 *
 * Sources
 *   ml/vocabulary.py                 -> SIGN_COUNT, VOCABULARY
 *   ml/features.py                   -> FEATURES_PER_FRAME (2 x 64)
 *   models/word_classes.json          -> SEQUENCE_LENGTH
 *   models/word_metrics.json          -> TEST_ACCURACY, TEST_SAMPLES
 *   backend/app/api/record.py         -> MIN_RECORD_FRAMES
 *   frontend/package.json             -> FRONTEND_STACK
 *   backend/requirements.txt          -> BACKEND_STACK
 */

import { TRANSLATIONS, type Language } from '../services/translation'

export const TEST_ACCURACY = 0.981042654028436
export const TEST_SAMPLE_COUNT = 211
export const SEQUENCE_LENGTH = 32
export const FEATURES_PER_FRAME = 128
export const SIGN_COUNT = 20
export const MODEL_ARCHITECTURE = 'GRU (128 hidden units)'
export const MODEL_FILE = 'models/word_model.pt'

export function formatAccuracy(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Signs the user can actually produce (STILL is the hand-down pause token). */
export const VOCABULARY = TRANSLATIONS.filter(
  (entry) => entry.id !== 'STILL' && entry.id !== 'SPACE',
)

/** BCP-47 tags used for correct script rendering + speech synthesis. */
export const LANGUAGE_SCRIPT: Record<Language, string> = {
  en: 'en',
  hi: 'hi',
  kn: 'kn',
}

export const LANGUAGE_FONT_CLASS: Record<Language, string> = {
  en: 'font-sans',
  hi: 'font-devanagari',
  kn: 'font-kannada',
}

export function displayLabel(signId: string): string {
  return signId.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
}