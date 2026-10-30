import type { ReactNode } from 'react'
import { Card, CardHeader } from '../ui/Card'
import StatusPill, { type StatusTone } from '../ui/StatusPill'
import Icon, { type IconName } from '../ui/Icon'
import type { Accent } from '../ui/Card'

export function StatusBar({
  items,
  className = '',
}: {
  items: { tone: StatusTone; label: string; key: string }[]
  className?: string
}) {
  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className}`}>
      {items.map((item) => (
        <li key={item.key}>
          <StatusPill tone={item.tone} label={item.label} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Camera + recognition workspace.
 *
 * The video element, HandOverlay and PrimaryUserDebugOverlay are untouched —
 * only the surrounding presentation changed.
 */
export default function CameraPanel({
  headingId,
  title,
  description,
  accent = 'brand',
  icon = 'camera',
  headerActions,
  status,
  video,
  placeholder,
  alerts,
  controls,
  footnote,
}: {
  headingId: string
  title: string
  description?: ReactNode
  accent?: Accent
  icon?: IconName
  headerActions?: ReactNode
  status: { tone: StatusTone; label: string; key: string }[]
  video?: ReactNode
  placeholder?: ReactNode
  alerts?: ReactNode
  controls?: ReactNode
  footnote?: ReactNode
}) {
  return (
    <Card as="section" aria-labelledby={headingId} className="overflow-hidden">
      <div className="border-b border-line p-4 sm:p-5">
        <CardHeader
          titleId={headingId}
          title={title}
          description={description}
          accent={accent}
          icon={<Icon name={icon} size={20} />}
          titleAs="h2"
        />
        <StatusBar items={status} className="mt-4" />
        {headerActions ? <div className="mt-4">{headerActions}</div> : null}
      </div>

      {/* 4:3 matches the requested 640x480 stream, so the feed is never cropped. */}
      <div className="p-4 sm:p-5">
        <div className="camera-frame aspect-[4/3] w-full">
          {video ?? placeholder ?? null}
        </div>
      </div>

      {alerts ? <div className="px-4 pb-4 sm:px-5 sm:pb-5">{alerts}</div> : null}

      {controls ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-subtle/60 px-4 py-4 sm:px-5">
          {controls}
        </div>
      ) : null}

      {footnote ? (
        <div className="border-t border-line px-4 py-3.5 sm:px-5">{footnote}</div>
      ) : null}
    </Card>
  )
}