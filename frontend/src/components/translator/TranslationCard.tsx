import type { ReactNode } from 'react'
import { Card, CardHeader } from '../ui/Card'
import Icon from '../ui/Icon'

/**
 * Translation output + language selector.
 *
 * The sentence is the primary output of the whole product, so it gets the
 * largest type on the page and a live region for screen readers.
 */
export default function TranslationCard({
  headingId,
  sentence,
  language,
  languageClass,
  languageOptions,
  onLanguageChange,
  languageLabel,
  wordCount,
  hint,
}: {
  headingId: string
  sentence: string
  language: string
  languageClass: string
  languageOptions: readonly { value: string; label: string }[]
  onLanguageChange: (value: string) => void
  languageLabel: string
  wordCount: number
  hint: ReactNode
}) {
  return (
    <Card as="section" aria-labelledby={headingId}>
      <div className="p-4 sm:p-5">
        <CardHeader
          titleId={headingId}
          title="Translation"
          description={`Built word by word · ${wordCount} ${wordCount === 1 ? 'word' : 'words'}`}
          accent="violet"
          icon={<Icon name="globe" size={20} />}
          titleAs="h2"
        />

        <div
          className="surface-sunken mt-4 flex min-h-[7rem] items-center px-4 py-5 sm:min-h-[8rem] sm:px-5"
          aria-live="polite"
          aria-atomic="true"
        >
          {sentence ? (
            <p className={`text-[26px] font-semibold leading-relaxed tracking-tight text-ink sm:text-[30px] ${languageClass}`} lang={language}>
              {sentence}
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Nothing translated yet. Start translation, raise your hand in front of the
              camera and perform a sign — then lower your hand to finish it.
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="surface-glass px-3.5 py-3">
            <label className="field-label" htmlFor="translator-language">
              {languageLabel}
            </label>
            <div className="control-wrap">
              <select
                id="translator-language"
                className="control"
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg
                className="control-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9.5 6 6 6-6" />
              </svg>
            </div>
          </div>

          <p className="self-end text-[12.5px] leading-relaxed text-ink-secondary">{hint}</p>
        </div>
      </div>
    </Card>
  )
}