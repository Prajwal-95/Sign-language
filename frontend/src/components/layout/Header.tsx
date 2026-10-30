import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import BrandMark, { NavItems } from './Brand'
import { ButtonLink } from '../ui/Button'
import Icon from '../ui/Icon'
import { Shell } from '../ui/Card'

/**
 * Application header — a floating warm-glass pill.
 *
 * - Sticky (not fixed) so it occupies real flow height and never obscures a
 *   heading, the webcam frame or the translation controls.
 * - Aligned to the same `Shell` (1200px) as the page content.
 * - A short warm scrim sits behind the pill so content scrolling underneath is
 *   masked rather than colliding with it.
 * - Desktop shows brand + nav in one row; below `md` a disclosure menu with
 *   46px touch targets, Escape-to-close and focus return.
 * - The active page is marked by `aria-current`, a mint surface, emerald text
 *   and a bolder weight + inset ring.
 */
export default function Header() {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const location = useLocation()

  // Dismiss the menu whenever the route changes (click or browser back/forward).
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Escape closes the menu and returns focus to the trigger.
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40">
      <Shell className="pt-3 pb-2">
        <div className="navbar-shell">
          <div className="navbar-glass">
            <div className="flex items-center justify-between gap-3 px-2.5 py-2 sm:gap-4 sm:px-3">
              <NavLink to="/" aria-label="ISL to Speech — go to the home page" className="brand-link min-w-0 rounded-xl">
                <BrandMark showTagline />
              </NavLink>

              <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
                <NavItems layout="bar" />
              </nav>

              <div className="flex flex-none items-center gap-2">
                <ButtonLink
                  to="/translator"
                  variant="primary"
                  size="sm"
                  className="hidden xl:inline-flex"
                >
                  Open Translator
                </ButtonLink>

                <button
                  ref={toggleRef}
                  type="button"
                  className="btn btn-secondary btn-sm md:hidden"
                  aria-expanded={open}
                  aria-controls={menuId}
                  onClick={() => setOpen((value) => !value)}
                >
                  <Icon name={open ? 'close' : 'menu'} size={18} />
                  <span className="sr-only">{open ? 'Close navigation menu' : 'Open navigation menu'}</span>
                </button>
              </div>
            </div>

            {open ? (
              <div id={menuId} className="border-t border-line/80 px-2.5 pb-2.5 pt-2 sm:px-3">
                <nav aria-label="Mobile" className="flex flex-col gap-0.5">
                  <NavItems layout="stack" onNavigate={() => setOpen(false)} />
                  <ButtonLink
                    to="/translator"
                    variant="primary"
                    size="md"
                    fullWidth
                    className="mt-2 xl:hidden"
                  >
                    Open Translator
                  </ButtonLink>
                </nav>
              </div>
            ) : null}
          </div>
        </div>
      </Shell>
    </header>
  )
}