import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

/**
 * Empty / error state. Used wherever a panel would otherwise be blank so the
 * user always gets an explanation instead of an unexplained gap.
 */
export default function EmptyState({
  icon = 'info',
  title,
  description,
  action,
  className = '',
}: {
  icon?: IconName
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-subtle text-ink-secondary">
        <Icon name={icon} size={22} />
      </span>
      <div data-empty-state-title className="mt-4 text-sm font-semibold text-ink">
        {title}
      </div>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}