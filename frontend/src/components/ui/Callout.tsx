import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type CalloutTone = 'info' | 'warn' | 'danger' | 'ok'

const TONE_CLASS: Record<CalloutTone, string> = {
  info: 'callout-info',
  warn: 'callout-warn',
  danger: 'callout-danger',
  ok: 'callout-ok',
}

const TONE_ICON: Record<CalloutTone, IconName> = {
  info: 'info',
  warn: 'alert',
  danger: 'alert',
  ok: 'shield',
}

const TONE_ROLE: Record<CalloutTone, 'status' | 'alert'> = {
  info: 'status',
  warn: 'status',
  ok: 'status',
  danger: 'alert',
}

/**
 * Inline banner for genuine system states: backend offline, missing model,
 * camera problems, saved settings feedback.
 */
export default function Callout({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: CalloutTone
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`callout ${TONE_CLASS[tone]} ${className}`}
      role={TONE_ROLE[tone]}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <Icon name={TONE_ICON[tone]} size={18} className="mt-0.5" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  )
}