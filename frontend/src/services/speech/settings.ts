/**
 * Speech preferences, read from the same localStorage blob the Settings page
 * writes (`isl-settings`). Kept in one place so the browser provider and the
 * local provider apply identical rate / pitch / voice settings.
 */

import type { SpeechState } from './types.ts'

export const SETTINGS_STORAGE_KEY = 'isl-settings'

export interface SpeechSettings {
  rate: number
  pitch: number
  /** Explicitly chosen voice name, or 'auto'/null for automatic matching. */
  voice: string | null
  autoSpeak: boolean
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  rate: 1,
  pitch: 1,
  voice: null,
  autoSpeak: false,
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Read the stored speech settings, tolerating absent/malformed storage. */
export function readSpeechSettings(): SpeechSettings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
  } catch {
    return DEFAULT_SPEECH_SETTINGS
  }
  if (!raw) return DEFAULT_SPEECH_SETTINGS

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      rate: clamp(parsed.rate, 0.5, 2, DEFAULT_SPEECH_SETTINGS.rate),
      pitch: clamp(parsed.pitch, 0.5, 2, DEFAULT_SPEECH_SETTINGS.pitch),
      voice:
        typeof parsed.voice === 'string' && parsed.voice !== 'auto' && parsed.voice.length > 0
          ? parsed.voice
          : null,
      autoSpeak: Boolean(parsed.autoSpeak),
    }
  } catch {
    return DEFAULT_SPEECH_SETTINGS
  }
}

/** State a caller sees before any provider has been probed. */
export function initialSpeechState(): SpeechState {
  return {
    phase: 'idle',
    language: null,
    provider: null,
    text: '',
    error: null,
    availability: { en: false, hi: false, kn: false },
    voicesReady: false,
  }
}