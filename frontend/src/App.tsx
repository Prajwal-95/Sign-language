import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import Home from './pages/Home'
import Translator from './pages/Translator'
import About from './pages/About'
import HowItWorks from './pages/HowItWorks'
import Dataset from './pages/Dataset'
import SettingsPage from './pages/Settings'
import NotFoundPage from './components/NotFoundPage'

/**
 * Application shell.
 *
 * Static gradient backdrop (no animation, no WebGL, no particles) -> glass
 * header -> routed main -> restrained footer. Rendering is immediate: there is
 * no splash screen, intro overlay or entrance animation anywhere in this app.
 */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="app-backdrop" aria-hidden="true" />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <ScrollToTopOnNavigate />
        <Header />

        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/translator" element={<Translator />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/about" element={<About />} />
            <Route path="/dataset" element={<Dataset />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </div>
  )
}