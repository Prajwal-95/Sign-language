import type { ReactNode } from 'react'
import { Card, CardHeader } from '../ui/Card'
import Icon from '../ui/Icon'
import type { Accent } from '../ui/Card'

/**
 * The sign the model most recently accepted, with its confidence.
 * Output is large because this is the number people watch during a demo.
 */
export default function DetectedSignCard({
  headingId,
  detectedSign,
  confidence,
  language,
  languageClass,
  footnote,
}: {
  headingId: string
  detectedSign: string | null
  confidence: number
  language: string
  languageClass: string
  footnote: ReactNode
}) {
  const tone: Accent = confidence >= 75 ? 'brand' : confidence > 0 ? 'teal' : 'brand'

  return (
    <Card as="section" aria-labelledby={headingId} accent={tone}>
      <div className="p-4 sm:p-5">
        <CardHeader
          titleId={headingId}
          title="Current sign"
          description="The most recently accepted gesture"
          accent={tone}
          icon={<Icon name="hand" size={20} />}
          titleAs="h2"
        />

        <div className="surface mt-4 px-4 py-6 text-center">
          {detectedSign ? (
            <>
              <p
                className={`font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl ${languageClass}`}
                lang={language}
              >
                {detectedSign}
              </p>
              <p className="mt-2 text-[12px] font-medium text-brand-700">Sign accepted</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-ink-secondary">Waiting for a sign</p>
              <p className="mx-auto mt-1.5 max-w-[28ch] text-[12.5px] leading-relaxed text-ink-muted">
                Raise your hand, perform the sign, then lower your hand to complete it.
              </p>
            </>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-secondary">Model confidence</span>
            <span className="text-[13px] font-semibold tabular-nums text-ink">{confidence}%</span>
          </div>
          <div
            className="meter mt-1.5"
            role="progressbar"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${confidence} percent model confidence`}
            aria-label="Model confidence"
          >
            <div
              className={
                confidence >= 75
                  ? 'meter-fill'
                  : confidence > 0
                    ? 'meter-fill meter-fill-warn'
                    : ''
              }
              style={{ width: `${Math.max(confidence, 2)}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-secondary">{footnote}</p>
      </div>
    </Card>
  )
}