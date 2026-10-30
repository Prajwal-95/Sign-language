/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Base URL of the local offline speech service (see tools/tts-service). */
  readonly VITE_LOCAL_TTS_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css'
