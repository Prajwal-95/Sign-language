import Icon, { type IconName } from './Icon'

/**
 * Status is communicated with three redundant channels — an icon shape, a
 * colour, and a text label — so it never depends on colour alone.
 */

export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'pill-ok',
  warn: 'pill-warn',
  danger: 'pill-danger',
  info: 'pill-info',
  neutral: 'pill-neutral',
}

const TONE_ICON: Record<StatusTone, IconName> = {
  ok: 'check-circle',
  warn: 'alert',
  danger: 'alert',
  info: 'info',
  neutral: 'info',
}

export interface StatusPillProps {
  tone?: StatusTone
  label: string
  /** `dot` keeps the pill compact; the default icon is clearer. */
  appearance?: 'dot' | 'icon'
  className?: string
}

export default function StatusPill({
  tone = 'neutral',
  label,
  appearance = 'dot',
  className = '',
}: StatusPillProps) {
  return (
    <span className={`pill ${TONE_CLASS[tone]} ${className}`}>
      {appearance === 'icon' ? (
        <Icon name={TONE_ICON[tone]} size={14} />
      ) : (
        <span aria-hidden="true" className="pill-dot" />
      )}
      <span>{label}</span>
    </span>
  )
}