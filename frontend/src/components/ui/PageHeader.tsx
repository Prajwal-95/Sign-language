import type { ReactNode } from 'react'

/**
 * The one page-header pattern used by every route: eyebrow, single <h1>, an
 * optional lead paragraph constrained to a readable measure, and an optional
 * action cluster.
 */
export default function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
  className = '',
}: {
  eyebrow?: string
  title: string
  lead?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
      <div className="min-w-0 max-w-prose">
        {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
        <h1 className="mt-3 text-[28px] font-bold leading-[1.15] text-ink sm:text-4xl">{title}</h1>
        {lead ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary sm:text-base">{lead}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  )
}