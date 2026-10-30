import type { SVGProps } from 'react'

/**
 * Single inline-SVG icon set.
 *
 * Every glyph is drawn on a 24x24 grid with a 1.75px stroke so they stay
 * optically consistent, inherit `currentColor`, and cost nothing to load
 * (no icon font, no sprite request).
 */

export type IconName =
  | 'camera'
  | 'hand'
  | 'cpu'
  | 'speaker'
  | 'globe'
  | 'shield'
  | 'check'
  | 'check-circle'
  | 'alert'
  | 'info'
  | 'menu'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'home'
  | 'database'
  | 'layers'
  | 'play'
  | 'pause'
  | 'stop'
  | 'undo'
  | 'trash'
  | 'sliders'
  | 'users'
  | 'lock'
  | 'book'
  | 'link'
  | 'arrow-right'

const PATHS: Record<IconName, JSX.Element> = {
  camera: (
    <>
      <path d="M3.5 8.6A2.6 2.6 0 0 1 6.1 6h1.7l1.1-2h6.2l1.1 2h1.7a2.6 2.6 0 0 1 2.6 2.6v7.8a2.6 2.6 0 0 1-2.6 2.6H6.1a2.6 2.6 0 0 1-2.6-2.6V8.6Z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </>
  ),
  hand: (
    <>
      <path d="M8.2 12.4V6.6a1.5 1.5 0 0 1 3 0v5.4" />
      <path d="M11.2 11.8V4.9a1.5 1.5 0 0 1 3 0v6.9" />
      <path d="M14.2 12V6.9a1.5 1.5 0 0 1 3 0v5.6" />
      <path d="M17.2 12.9v2.3a5.3 5.3 0 0 1-5.3 5.3h-.6a5.3 5.3 0 0 1-5.3-5.3v-2.9" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.4h3.1L11.8 5.6a.6.6 0 0 1 1 .5v11.8a.6.6 0 0 1-1 .5L7.1 14.6H4a.6.6 0 0 1-.6-.6v-4a.6.6 0 0 1 .6-.6Z" />
      <path d="M15.8 9.4a3.7 3.7 0 0 1 0 5.2" />
      <path d="M18.4 6.9a7.3 7.3 0 0 1 0 10.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3.4c2.3 2.4 3.5 5.3 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.3-3.5-8.6S9.7 5.8 12 3.4Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5.2 6v5.6c0 3.9 2.8 7.4 6.8 9.2 4-1.8 6.8-5.3 6.8-9.2V6L12 3.2Z" />
      <path d="m9.2 12 2 2 3.6-4" />
    </>
  ),
  check: <path d="m5 12.6 4.5 4.5L19 7.4" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.3 12.2 2.6 2.6 4.8-5.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.4 2.9 19.6h18.2L12 4.4Z" />
      <path d="M12 10v4.3" />
      <path d="M12 17.2h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2v5" />
      <path d="M12 7.9h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" />,
  'chevron-right': <path d="m9.4 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9.4 7 7 7-7" />,
  home: (
    <>
      <path d="M3.6 10.4 12 3.6l8.4 6.8" />
      <path d="M5.6 9.6V19a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4V9.6" />
      <path d="M9.8 20.4v-6.2h4.4v6.2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.4" ry="2.8" />
      <path d="M4.6 6v12c0 1.5 3.3 2.8 7.4 2.8s7.4-1.3 7.4-2.8V6" />
      <path d="M4.6 12c0 1.5 3.3 2.8 7.4 2.8s7.4-1.3 7.4-2.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.3 8.4 4.3-8.4 4.3-8.4-4.3L12 3.3Z" />
      <path d="m3.6 12.2 8.4 4.3 8.4-4.3" />
      <path d="m3.6 16.6 8.4 4.3 8.4-4.3" />
    </>
  ),
  play: <path d="M8.2 5.4 19 12 8.2 18.6V5.4Z" />,
  pause: (
    <>
      <rect x="8.4" y="5.4" width="3" height="13.2" rx="1" />
      <rect x="12.6" y="5.4" width="3" height="13.2" rx="1" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.6" />,
  undo: (
    <>
      <path d="M9.1 5.2 4.6 9.7l4.5 4.5" />
      <path d="M4.6 9.7h9.6a5.4 5.4 0 0 1 0 10.8H9.9" />
    </>
  ),
  trash: (
    <>
      <path d="M4.6 6.9h14.8" />
      <path d="M9.6 6.9V5.1a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v1.8" />
      <path d="m6.6 6.9.9 12.2a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l.9-12.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.5h8M17.5 7.5H20M4 16.5h3.5M13 16.5H20" />
      <circle cx="14.6" cy="7.5" r="2.3" />
      <circle cx="10.1" cy="16.5" r="2.3" />
    </>
  ),
  users: (
    <>
      <path d="M15.4 20.2v-1.6a3.6 3.6 0 0 0-3.6-3.6H7.2a3.6 3.6 0 0 0-3.6 3.6v1.6" />
      <circle cx="9.5" cy="8.1" r="3.2" />
      <path d="M16.6 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M20.4 20.2v-1.6a3.6 3.6 0 0 0-2.7-3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.2" width="14.8" height="10.2" rx="2.2" />
      <path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6" />
    </>
  ),
  book: (
    <>
      <path d="M4.2 6a2 2 0 0 1 2-2h13v13.4H6.2a2 2 0 0 0-2 2V6Z" />
      <path d="M4.2 19.4a2 2 0 0 0 2 2h13" />
    </>
  ),
  link: (
    <>
      <path d="M10.3 13.7a3.6 3.6 0 0 0 5.4.4l2.5-2.5a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4" />
      <path d="M13.7 10.3a3.6 3.6 0 0 0-5.4-.4l-2.5 2.5a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4" />
    </>
  ),
  'arrow-right': <path d="M4.6 12h14.2M13.4 6.6 18.8 12l-5.4 5.4" />,
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Pixel size for width + height. */
  size?: number
}

export default function Icon({ name, size = 20, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}