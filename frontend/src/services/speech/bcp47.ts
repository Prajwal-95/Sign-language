/**
 * BCP-47 helpers shared by every speech provider.
 *
 * Voice lists in the wild are inconsistent: 'hi-IN', 'hi_IN', 'hi-in', 'hin'.
 * Everything is normalised to lowercase, dash-separated tags before matching so
 * a voice is never missed (or wrongly matched) because of formatting.
 */

import { TTS_LANGUAGE, type Language } from '../translation.ts'
import type { SpeechLanguage } from './types.ts'

/** 'hi_IN' / ' HI-in ' -> 'hi-in' */
export function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, '-')
}

/** Primary subtag: 'hi-IN' -> 'hi' */
export function tagPrefix(tag: string): string {
  return normaliseTag(tag).split('-')[0]
}

/** Is `voiceTag` the same language as `wantedTag`? */
export function tagsMatch(voiceTag: string, wantedTag: string): boolean {
  return tagPrefix(voiceTag) === tagPrefix(wantedTag)
}

/** Narrow an arbitrary string to a supported output language. */
export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === 'en' || value === 'hi' || value === 'kn'
}

/** Narrow an arbitrary BCP-47 tag to one of the app's output languages. */
export function languageForTag(tag: string): SpeechLanguage | null {
  const prefix = tagPrefix(tag)
  const match = (Object.keys(TTS_LANGUAGE) as Language[]).find(
    (lang) => tagPrefix(TTS_LANGUAGE[lang]) === prefix,
  )
  return match ?? null
}

/** BCP-47 tag for an output language ('hi' -> 'hi-IN'). */
export function speechTag(language: SpeechLanguage): string {
  return TTS_LANGUAGE[language] ?? TTS_LANGUAGE.en
}

/** Human label for an output language, used in speech status messages. */
export const LANGUAGE_LABELS: Readonly<Record<SpeechLanguage, string>> = {
  en: 'English',
  hi: 'Hindi',
  kn: 'Kannada',
}