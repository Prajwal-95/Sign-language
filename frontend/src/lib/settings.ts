/**
 * Settings storage shared by the Settings page and app bootstrap.
 *
 * Extracted from the page so high-contrast can be applied before the first
 * paint (no flash of the default theme) and so the settings page stays a view.
 */

export interface AppSettings {
  /** Speech synthesis rate. */
  rate: number
  /** Speech synthesis pitch. */
  pitch: number
  /** Accessibility: hard borders, opaque surfaces, black text. */
  highContrast: boolean
  /** Speak each accepted sign automatically. */
  autoSpeak: boolean
  /** Minimum model confidence requested for acceptance. */
  confidenceThreshold: number
  /** Explicit voice name, or 'auto' for the browser default. */
  voice: string
}

export const SETTINGS_STORAGE_KEY = 'isl-settings'
export const SETTINGS_CHANGED_EVENT = 'isl-settings-changed'

export const DEFAULT_SETTINGS: AppSettings = {
  rate: 1,
  pitch: 1,
  highContrast: false,
  autoSpeak: false,
  confidenceThreshold: 0.5,
  voice: 'auto',
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable (private mode) — settings stay session-only */
  }
}

export function applyHighContrast(enabled: boolean): void {
  document.documentElement.setAttribute('data-theme', enabled ? 'high-contrast' : '')
}