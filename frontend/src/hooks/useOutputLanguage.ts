/**
 * Language state management hook.
 *
 * Centralizes the selected output language state and persistence.
 * Used by both the Translator page and Settings page to ensure
 * a single source of truth.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Language } from '../services/translation'
import { loadLanguage, saveLanguage, SUPPORTED_LANGUAGES } from '../services/translation'

const LANGUAGE_EVENT = 'isl-language-changed'

/**
 * Hook for accessing and modifying the global output language.
 * Persists selection to localStorage and broadcasts changes via window event.
 */
export function useOutputLanguage(): {
  language: Language
  setLanguage: (lang: Language) => void
  supportedLanguages: readonly { code: Language; label: string; nativeLabel: string }[]
} {
  const [language, setLanguageState] = useState<Language>(() => loadLanguage())

  // Broadcast changes to other components (e.g., Settings page)
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    saveLanguage(lang)
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language: lang } }))
  }, [])

  // Listen for external changes (e.g., from Settings page in another tab)
  useEffect(() => {
    const handler = (e: CustomEvent<{ language: Language }>) => {
      setLanguageState(e.detail.language)
    }
    window.addEventListener(LANGUAGE_EVENT, handler as EventListener)
    return () => window.removeEventListener(LANGUAGE_EVENT, handler as EventListener)
  }, [])

  return {
    language,
    setLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
  }
}

/**
 * Hook for components that only need to read the current language
 * without modifying it (lighter weight).
 */
export function useCurrentLanguage(): Language {
  const [language, setLanguage] = useState<Language>(() => loadLanguage())

  useEffect(() => {
    const handler = (e: CustomEvent<{ language: Language }>) => {
      setLanguage(e.detail.language)
    }
    window.addEventListener(LANGUAGE_EVENT, handler as EventListener)
    return () => window.removeEventListener(LANGUAGE_EVENT, handler as EventListener)
  }, [])

  return language
}