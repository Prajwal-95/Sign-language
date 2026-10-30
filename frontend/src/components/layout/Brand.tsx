import { NavLink } from 'react-router-dom'
import Icon, { type IconName } from '../ui/Icon'

/**
 * Brand lockup: a dimensional emerald tile with the hand glyph, plus the
 * wordmark. One component so the header and footer always agree.
 */
export default function BrandMark({
  size = 'md',
  showTagline = false,
}: {
  size?: 'sm' | 'md'
  showTagline?: boolean
}) {
  const tile = size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-10 w-10 rounded-xl'
  const glyph = size === 'sm' ? 18 : 22

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`brand-mark grid ${tile} flex-none place-items-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_0_#044c3c,0_6px_14px_-8px_rgba(115,75,55,0.7)]`}
        style={{ backgroundImage: 'linear-gradient(180deg,#0a8071 0%,#078269 45%,#055e4c 100%)' }}
      >
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.2 12.4V6.6a1.5 1.5 0 0 1 3 0v5.4" />
          <path d="M11.2 11.8V4.9a1.5 1.5 0 0 1 3 0v6.9" />
          <path d="M14.2 12V6.9a1.5 1.5 0 0 1 3 0v5.6" />
          <path d="M17.2 12.9v2.3a5.3 5.3 0 0 1-5.3 5.3h-.6a5.3 5.3 0 0 1-5.3-5.3v-2.9" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="brand-word font-display text-[17px] font-bold tracking-tight text-ink">
          ISL<span className="mx-0.5 text-brand-600">&rarr;</span>Speech
        </span>
        {showTagline ? (
          <span className="mt-1 hidden text-[11px] font-medium tracking-wide text-ink-secondary lg:block">
            Real-time Indian Sign Language to speech
          </span>
        ) : null}
      </span>
    </span>
  )
}

interface NavLinkDef {
  to: string
  label: string
  end: boolean
  icon: IconName
}

/** The single ordered list of routes. */
export const NAV_LINKS: readonly NavLinkDef[] = [
  { to: '/', label: 'Home', end: true, icon: 'home' },
  { to: '/translator', label: 'Translator', end: false, icon: 'camera' },
  { to: '/how-it-works', label: 'How It Works', end: false, icon: 'book' },
  { to: '/about', label: 'About', end: false, icon: 'info' },
  { to: '/dataset', label: 'Dataset', end: false, icon: 'database' },
  { to: '/settings', label: 'Settings', end: false, icon: 'sliders' },
]

/**
 * Renders the route list.
 * - `bar`   : inline desktop nav, text only so six items stay comfortable at 1024px.
 * - `stack` : the mobile disclosure list, icon + label with 46px touch targets.
 *
 * Active state is signalled three ways (mint surface, emerald text, bolder
 * weight + inset ring) and by `aria-current="page"` from NavLink, so it never
 * depends on colour alone.
 */
export function NavItems({ layout = 'bar', onNavigate }: { layout?: 'bar' | 'stack'; onNavigate?: () => void }) {
  if (layout === 'stack') {
    return (
      <>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link-stack ${isActive ? 'nav-link-stack-active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Icon name={link.icon} size={19} className="nav-icon" />
                <span className="flex-1">{link.label}</span>
                {isActive ? (
                  <>
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-500" />
                    <span className="sr-only">(current page)</span>
                  </>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </>
    )
  }

  return (
    <>
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          {link.label}
        </NavLink>
      ))}
    </>
  )
}