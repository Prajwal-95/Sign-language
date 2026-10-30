import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_STORAGE_KEY,
  applyHighContrast,
  loadSettings,
  saveSettings,
  type AppSettings,
} from '../lib/settings'

/**
 * Single source of truth for persisted device settings.
 *
 * - persists to localStorage under `isl-settings` (key unchanged)
 * - applies high-contrast to <html data-theme>
 * - broadcasts `isl-settings-changed` in-tab
 * - listens for `storage` so a second tab stays in sync
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  useEffect(() => {
    applyHighContrast(settings.highContrast)
  }, [settings.highContrast])

  useEffect(() => {
    saveSettings(settings)
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }, [settings])

  // Cross-tab synchronisation.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SETTINGS_STORAGE_KEY) return
      setSettings(loadSettings())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }))
  }, [])

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  return { settings, update, reset }
}

export type { AppSettings }