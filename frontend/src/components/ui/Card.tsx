import type { ReactNode } from 'react'

/**
 * Layout + surface primitives.
 *
 * `Shell` owns the single page gutter/width used by the header, main and
 * footer so they can never drift apart. `Card` owns every content surface and
 * deliberately exposes only three visual treatments — solid, glass and tinted
 * — so the interface does not become a collage of panels.
 */

export type Accent = 'brand' | 'teal' | 'violet' | 'coral'

export function Shell({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'header' | 'footer' | 'main'
}) {
  return <Tag className={`shell ${className}`}>{children}</Tag>
}

const ACCENT_CLASS: Record<Accent, string> = {
  brand: 'tint-emerald',
  teal: 'tint-teal',
  violet: 'tint-violet',
  coral: 'tint-coral',
}

const ACCENT_ICON: Record<Accent, string> = {
  brand: 'bg-brand-50 text-brand-600 border-brand-200',
  teal: 'bg-teal-50 text-teal-600 border-teal-200',
  violet: 'bg-violet-50 text-violet-600 border-violet-200',
  coral: 'bg-coral-50 text-coral-700 border-coral-200',
}

const ACCENT_RING: Record<Accent, string> = {
  brand: 'border-brand-500',
  teal: 'border-teal-400',
  violet: 'border-violet-500',
  coral: 'border-coral-500',
}

const ACCENT_TEXT: Record<Accent, string> = {
  brand: 'text-brand-600',
  teal: 'text-teal-600',
  violet: 'text-violet-600',
  coral: 'text-coral-700',
}

export function accentIconClass(accent: Accent): string {
  return ACCENT_ICON[accent]
}

export function accentTextClass(accent: Accent): string {
  return ACCENT_TEXT[accent]
}

export function accentRingClass(accent: Accent): string {
  return ACCENT_RING[accent]
}

export interface CardProps {
  children: ReactNode
  /** `solid` for dense reading, `glass` for overlays/preview, `tinted` for emphasis. */
  variant?: 'solid' | 'glass' | 'flat' | 'sunken'
  accent?: Accent
  className?: string
  /**
   * Opt-in lift + shadow on hover. Only for cards with no interactive
   * children, so hovering never moves a live control. Transform-only, so it
   * can never cause a layout shift, and neutralised under reduced motion.
   */
  hoverable?: boolean
  /** Applied to the outer element (e.g. `id` + `tabIndex` for focus targets). */
  id?: string
  as?: 'div' | 'section' | 'article' | 'aside'
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function Card({
  children,
  variant = 'solid',
  accent,
  className = '',
  hoverable = false,
  id,
  as: Tag = 'div',
  ...rest
}: CardProps) {
  const base = variant === 'flat' ? 'surface-flat' : variant === 'glass' ? 'glass' : variant === 'sunken' ? 'surface-sunken' : 'surface'
  return (
    <Tag
      id={id}
      className={[base, accent ? ACCENT_CLASS[accent] : '', hoverable ? 'card-hover' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  description,
  icon,
  accent = 'brand',
  actions,
  titleAs = 'h2',
  titleId,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  accent?: Accent
  actions?: ReactNode
  titleAs?: 'h2' | 'h3'
  titleId?: string
}) {
  const TitleTag = titleAs
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            className={`grid h-10 w-10 flex-none place-items-center rounded-xl border ${ACCENT_ICON[accent]}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <TitleTag id={titleId} className="text-base font-semibold text-ink sm:text-[17px]">
            {title}
          </TitleTag>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}