import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // MediaPipe's wasm loader is loaded from a CDN at runtime (see
    // services/primaryUserTracker.ts and hooks/useSignRecognition.ts), so no
    // large binary assets ship in this bundle.
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    host: true, // accessible on LAN (phone testing)
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
