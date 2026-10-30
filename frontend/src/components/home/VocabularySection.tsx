import { Link } from 'react-router-dom'
import { Shell } from '../ui/Card'
import { LANGUAGE_FONT_CLASS, displayLabel, VOCABULARY } from '../../lib/projectData'
import type { TranslationEntry } from '../../services/translation'

const FEATURED = ['HELLO', 'THANK_YOU', 'GOOD_MORNING', 'DRINK', 'COME', 'TEA', 'KEY', 'WIFE']

/**
 * Each card cycles through a different accent so the grid reads as one system
 * rather than eight identical boxes. Every accent text colour clears 4.5:1 on
 * the card surface.
 */
interface Accent {
  rail: string
  en: string
  hi: string
  kn: string
  tint: string
}

const ACCENTS: Accent[] = [
  { rail: 'bg-gradient-to-r from-brand-500 to-teal-400', en: 'text-ink', hi: 'text-brand-700', kn: 'text-teal-600', tint: 'group-hover:border-brand-300' },
  { rail: 'bg-gradient-to-r from-teal-400 to-violet-400', en: 'text-ink', hi: 'text-teal-600', kn: 'text-violet-700', tint: 'group-hover:border-teal-300' },
  { rail: 'bg-gradient-to-r from-violet-500 to-coral-400', en: 'text-ink', hi: 'text-violet-700', kn: 'text-coral-700', tint: 'group-hover:border-violet-300' },
  { rail: 'bg-gradient-to-r from-coral-400 to-amber-300', en: 'text-ink', hi: 'text-coral-700', kn: 'text-brand-700', tint: 'group-hover:border-coral-300' },
]

function VocabularyCard({ entry, accent }: { entry: TranslationEntry; accent: Accent }) {
  return (
    <li
      className={`card-hover group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/92 p-5 shadow-card transition-colors duration-150 ${accent.tint}`}
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${accent.rail}`} />

      {/* English — Sora, the display face */}
      <p className={`font-display text-[19px] font-bold leading-tight tracking-tight ${accent.en}`}>
        {displayLabel(entry.id)}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        English
      </p>

      <span aria-hidden="true" className="my-3.5 h-px w-full bg-line" />

      {/* Hindi — Noto Sans Devanagari */}
      <p className={`text-[17px] font-medium leading-snug ${LANGUAGE_FONT_CLASS.hi} ${accent.hi}`} lang="hi">
        {entry.hi}
      </p>

      {/* Kannada — Noto Sans Kannada */}
      <p className={`mt-1.5 text-[17px] font-medium leading-snug ${LANGUAGE_FONT_CLASS.kn} ${accent.kn}`} lang="kn">
        {entry.kn}
      </p>

      <span className="mt-auto pt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {entry.id}
      </span>
    </li>
  )
}

/**
 * The real vocabulary, shown inside a single glass slab.
 *
 * Content is sourced from the one translation table, so the three languages can
 * never drift out of sync with what the translator actually outputs. The slab
 * is the only glass element here — the cards inside stay near-opaque so the
 * non-Latin scripts remain easy to read.
 */
export default function VocabularySection() {
  const featured = VOCABULARY.filter((entry) => FEATURED.includes(entry.id))

  return (
    <section aria-labelledby="vocab-heading" className="wash-peach border-b border-line">
      <Shell className="py-14 sm:py-16">
        <div className="max-w-2xl">
          <p className="kicker">The vocabulary</p>
          <h2 id="vocab-heading" className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            Every sign, in three languages
          </h2>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-secondary">
            The model classifies a fixed set of common daily ISL word signs. Change the output
            language at any time — the text and the voice change together.
          </p>
        </div>

        {/* ---- Glass slab ---- */}
        <div className="glass-strong relative mt-9 overflow-hidden rounded-[28px] p-2.5 sm:rounded-[32px] sm:p-4">
          {/* static colour wash inside the slab */}
          <div aria-hidden="true" className="wash-hero pointer-events-none absolute inset-0 opacity-70" />
          {/* thin top rail so the slab reads as one deliberate object */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent"
          />

          <div className="relative">
            {/* Script legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1.5 pb-4 pt-2 sm:px-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Rendered in
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">
                <span className="font-display">Aa</span>
                Sora
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">
                <span className={`text-[13px] ${LANGUAGE_FONT_CLASS.hi}`}>अ</span>
                Noto Sans Devanagari
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">
                <span className={`text-[13px] ${LANGUAGE_FONT_CLASS.kn}`}>ಅ</span>
                Noto Sans Kannada
              </span>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((entry, index) => (
                <VocabularyCard key={entry.id} entry={entry} accent={ACCENTS[index % ACCENTS.length]} />
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-sm text-ink-secondary">
          Showing {featured.length} of {VOCABULARY.length} signs.{' '}
          <Link
            to="/dataset"
            className="rounded font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700"
          >
            See the full vocabulary
          </Link>
          .
        </p>
      </Shell>
    </section>
  )
}