import { Shell, type Accent } from '../ui/Card'
import {
  FEATURES_PER_FRAME,
  formatAccuracy,
  SEQUENCE_LENGTH,
  SIGN_COUNT,
  TEST_ACCURACY,
  TEST_SAMPLE_COUNT,
} from '../../lib/projectData'

const METRICS = [
  {
    value: formatAccuracy(TEST_ACCURACY),
    label: 'Model test accuracy',
    detail: `Accuracy on a held-out test set of ${TEST_SAMPLE_COUNT} sequences (models/word_metrics.json). An offline evaluation, not a live-accuracy guarantee.`,
    accent: 'brand' as const,
  },
  {
    value: String(SIGN_COUNT - 1),
    label: 'ISL word signs',
    detail: `Vocabulary defined in ml/vocabulary.py — ${SIGN_COUNT} model classes including the hand-down pause token.`,
    accent: 'teal' as const,
  },
  {
    value: String(FEATURES_PER_FRAME),
    label: 'Features per frame',
    detail: 'Two hands x 64 values each (ml/features.py): 21 normalised landmarks per hand plus a handedness flag.',
    accent: 'violet' as const,
  },
  {
    value: String(SEQUENCE_LENGTH),
    label: 'Frames per sequence',
    detail: 'The window the GRU classifies when your hand comes back down (models/word_classes.json).',
    accent: 'coral' as const,
  },
]

const ACCENT_BAR: Record<Accent, string> = {
  brand: 'bg-brand-500',
  teal: 'bg-teal-400',
  violet: 'bg-violet-500',
  coral: 'bg-coral-500',
}

export default function MetricsSection() {
  return (
    <section aria-labelledby="metrics-heading" className="band-blush border-b border-line">
      <Shell className="py-14">
        <div className="max-w-2xl">
          <p className="kicker">Verified numbers</p>
          <h2 id="metrics-heading" className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            What the model was actually measured on
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            Every figure below is taken from a file in this repository. Nothing here is
            estimated, projected or guaranteed.
          </p>
        </div>

        <dl className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric) => (
            <div key={metric.label} className="surface card-hover flex flex-col p-5">
              <span aria-hidden="true" className={`h-1 w-10 rounded-full ${ACCENT_BAR[metric.accent]}`} />
              <dd className="mt-4 font-display text-[34px] font-bold leading-none tracking-tight text-ink">
                {metric.value}
              </dd>
              <dt className="mt-2 text-[13px] font-semibold text-ink">{metric.label}</dt>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">{metric.detail}</p>
            </div>
          ))}
        </dl>
      </Shell>
    </section>
  )
}