import Icon from '../ui/Icon'

/**
 * Product-preview composition.
 *
 * This is an ILLUSTRATIVE, STATIC representation of the translator workspace.
 * It is explicitly labelled as such, shows no fabricated confidence values or
 * live status, and is built from the same hand-landmark motif the real
 * overlay draws.
 */
const EXAMPLE_SENTENCE = [
  { word: 'Hello', lang: 'en' as const },
  { word: 'Thank you', lang: 'en' as const },
]

export default function TranslatorPreview() {
  return (
    <div className="glass-strong rounded-3xl p-3 sm:p-4">
      <div className="rounded-2xl border border-line bg-surface/85 p-4 sm:p-5">
        {/* Window chrome + honest labelling */}
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-coral-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-300" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
            Translator
          </p>
          <span className="ml-auto rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
            Illustrative preview
          </span>
        </div>

        {/* Static camera stand-in */}
        <div className="camera-frame mt-4 grid aspect-[4/3] place-items-center">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <svg
              viewBox="0 0 100 100"
              className="h-28 w-28 text-brand-300 sm:h-32 sm:w-32"
              fill="none"
              aria-hidden="true"
            >
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85">
                <path d="M50 80 38 70M50 80l-8-10M50 80l8-10M50 80l10-10M50 80l12-12M50 80 32 68" />
                <path d="M38 70 30 58 27 47 26 37" />
                <path d="M48 48 50 33 51 23 52 16" />
                <path d="M58 46 61 29 62 18 63 10" />
                <path d="M67 48 71 32 72 23 73 16" />
                <path d="M75 52 80 40 81 32 82 26" />
              </g>
              <g fill="currentColor">
                {[
                  [50, 80], [38, 70], [30, 58], [27, 47], [26, 37], [48, 48], [50, 33], [51, 23],
                  [52, 16], [58, 46], [61, 29], [62, 18], [63, 10], [67, 48], [71, 32], [72, 23],
                  [73, 16], [75, 52], [80, 40], [81, 32], [82, 26],
                ].map(([x, y]) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" />
                ))}
              </g>
            </svg>
            <p className="text-xs font-medium text-white/75">
              Static illustration — the live view draws your own hand landmarks.
            </p>
          </div>
        </div>

        {/* Pipeline chips that describe real capabilities, not live status */}
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Hand landmarks', value: '21 per hand' },
            { label: 'Model', value: 'GRU sequence' },
            { label: 'Languages', value: 'EN · HI · KN' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-line bg-surface px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-[13px] font-semibold text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>

        {/* Example output */}
        <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
            Example output · English
          </p>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
            {EXAMPLE_SENTENCE.map((part) => part.word).join(', ')}
          </p>
          <p className="mt-1 text-[12px] text-brand-700">ನಮಸ್ಕಾರ, ಧನ್ಯವಾದ</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="btn btn-primary btn-sm pointer-events-none select-none">
            <Icon name="speaker" size={15} />
            Speak
          </span>
          <span className="btn btn-secondary btn-sm pointer-events-none select-none">Undo</span>
          <span className="btn btn-secondary btn-sm pointer-events-none select-none">Clear</span>
          <span className="ml-auto text-[11px] text-ink-muted">Preview only — not clickable</span>
        </div>
      </div>
    </div>
  )
}