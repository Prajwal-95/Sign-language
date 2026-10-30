import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { applyHighContrast, loadSettings } from './lib/settings'
import './styles.css'

// Apply the persisted accessibility preference before the first paint so the
// app never flashes the default theme on load.
try {
  applyHighContrast(loadSettings().highContrast)
} catch {
  /* storage unavailable — default theme is fine */
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)