import { useEffect, useState } from 'react'
import PageHeader from '../components/ui/PageHeader'
import Callout from '../components/ui/Callout'
import EmptyState from '../components/ui/EmptyState'
import StatusPill from '../components/ui/StatusPill'
import { ButtonLink } from '../components/ui/Button'
import { Card, Shell } from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import { checkBackendHealth, fetchSampleCounts } from '../services/api'
import {
  displayLabel,
  FEATURES_PER_FRAME,
  LANGUAGE_FONT_CLASS,
  SEQUENCE_LENGTH,
  VOCABULARY,
} from '../lib/projectData'

type LoadState = 'loading' | 'ready' | 'offline'

export default function Dataset() {
  useEffect(() => {
    document.title = 'Dataset · ISL to Speech'
  }, [])

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [modelLoaded, setModelLoaded] = useState(false)
  const [numClasses, setNumClasses] = useState<number | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false
    checkBackendHealth().then((health) => {
      if (cancelled) return
      if (!health) {
        setState('offline')
        return
      }
      setModelLoaded(Boolean(health.model_loaded))
      if (health.num_classes) setNumClasses(health.num_classes)
      setState('ready')
    })
    fetchSampleCounts().then((data) => {
      if (!cancelled) setCounts(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const totalUserSamples = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const calibrated = VOCABULARY.filter((entry) => (counts[entry.id] ?? 0) > 0)

  const FACTS = [
    { value: String(VOCABULARY.length), label: 'ISL word signs', detail: 'ml/vocabulary.py' },
    {
      value: String(FEATURES_PER_FRAME),
      label: 'Features per frame',
      detail: 'ml/features.py',
    },
    {
      value: String(SEQUENCE_LENGTH),
      label: 'Frames per sequence',
      detail: 'models/word_classes.json',
    },
  ]

  return (
    <Shell className="band-peach py-10 sm:py-14">
      <PageHeader
        eyebrow="Dataset & training"
        title="Trained on real ISL — and tuned to you"
        lead="The shipped model was trained on recorded ISL footage. The in-app recorder lets you add sequences from your own webcam so the model learns your hand, your camera and your lighting."
      />

      {/* Backend state */}
      <Card variant="glass" className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-line bg-surface-subtle text-ink-secondary">
            <Icon name="database" size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">
              {modelLoaded ? 'Trained model loaded on the backend' : 'No trained model on the backend'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-secondary">
              <code className="code-inline">models/word_model.pt</code>
              {numClasses ? ` · ${numClasses} classes` : ''}
            </p>
          </div>
        </div>
        <StatusPill
          tone={state === 'loading' ? 'warn' : state === 'offline' ? 'danger' : modelLoaded ? 'ok' : 'warn'}
          label={
            state === 'loading'
              ? 'Checking backend'
              : state === 'offline'
                ? 'Backend unreachable'
                : modelLoaded
                  ? 'Model ready'
                  : 'Model missing'
          }
        />
      </Card>

      {state === 'offline' ? (
        <Callout tone="warn" title="Backend unreachable" className="mt-5">
          Live sample counts and model status come from the backend. Start it from the{' '}
          <code className="code-inline">backend</code> folder with{' '}
          <code className="code-inline">.\run.bat</code> to see them. The vocabulary below is read
          from the frontend translation table and is always accurate.
        </Callout>
      ) : null}

      {/* Verified facts */}
      <section aria-labelledby="facts-heading" className="mt-10">
        <h2 id="facts-heading" className="text-lg font-bold text-ink sm:text-xl">
          Fixed properties of the current pipeline
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {FACTS.map((fact) => (
            <Card key={fact.label} hoverable className="p-5">
              <dd className="font-display text-3xl font-bold leading-none text-ink">{fact.value}</dd>
              <dt className="mt-2 text-[13px] font-semibold text-ink">{fact.label}</dt>
              <p className="mt-1 text-[12px] text-ink-muted">
                Source: <code className="code-inline">{fact.detail}</code>
              </p>
            </Card>
          ))}
        </dl>
      </section>

      {/* Vocabulary table */}
      <section aria-labelledby="vocabulary-heading" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="vocabulary-heading" className="text-lg font-bold text-ink sm:text-xl">
              Vocabulary &amp; your recorded samples
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-secondary">
              Sample counts are read live from <code className="code-inline">/api/sample-counts</code>.
            </p>
          </div>
          <p className="text-[13px] text-ink-secondary">
            {totalUserSamples} recorded {totalUserSamples === 1 ? 'sample' : 'samples'} across{' '}
            {calibrated.length} {calibrated.length === 1 ? 'sign' : 'signs'}
          </p>
        </div>

        <Card variant="flat" className="mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                ISL vocabulary with English, Hindi, Kannada text and the number of samples recorded
                from your webcam
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-subtle">
                  <th scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    Sign
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    Model class
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    हिन्दी
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    ಕನ್ನಡ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    Your samples
                  </th>
                </tr>
              </thead>
              <tbody>
                {VOCABULARY.map((entry, index) => {
                  const sampleCount = counts[entry.id] ?? 0
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-line last:border-0 ${index % 2 === 1 ? 'bg-surface-subtle/40' : ''}`}
                    >
                      <th scope="row" className="px-4 py-3 text-[13.5px] font-semibold text-ink">
                        {displayLabel(entry.id)}
                      </th>
                      <td className="px-4 py-3">
                        <code className="code-inline text-[12px]">{entry.id}</code>
                      </td>
                      <td className={`px-4 py-3 text-[15px] text-ink-secondary ${LANGUAGE_FONT_CLASS.hi}`}>
                        {entry.hi}
                      </td>
                      <td className={`px-4 py-3 text-[15px] text-ink-secondary ${LANGUAGE_FONT_CLASS.kn}`}>
                        {entry.kn}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusPill
                          tone={sampleCount > 0 ? 'ok' : 'neutral'}
                          label={sampleCount > 0 ? `${sampleCount} recorded` : 'None yet'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {totalUserSamples === 0 && state !== 'loading' ? (
          <EmptyState
            className="surface mt-4"
            icon="layers"
            title="No personal samples recorded yet"
            description="Use the recorder at the bottom of the Translator to capture sequences from your own webcam. Ten or more per sign noticeably improves live recognition."
            action={
              <ButtonLink to="/translator" variant="primary" size="md">
                Open the recorder
              </ButtonLink>
            }
          />
        ) : null}
      </section>

      {/* How to extend */}
      <section aria-labelledby="extend-heading" className="mt-12">
        <Card accent="teal" className="p-6 sm:p-7">
          <h2 id="extend-heading" className="text-lg font-bold text-ink sm:text-xl">
            How to grow the vocabulary
          </h2>
          <ol className="mt-4 space-y-3">
            {[
              <>
                Add the new sign identifier to <code className="code-inline">ml/vocabulary.py</code>.
              </>,
              <>
                Record roughly 10 samples of your hand from the Translator's “Record your hand”
                panel.
              </>,
              <>
                Run{' '}
                <code className="code-inline">python scripts/train_lstm.py --augment</code> to retrain
                the GRU with your samples included.
              </>,
              <>Restart the backend so the new checkpoint is loaded.</>,
            ].map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-[14px] leading-relaxed text-ink-secondary">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-lg border border-teal-200 bg-teal-50 text-[12px] font-bold text-teal-600">
                  {index + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/translator" variant="primary" size="md">
              Record your hand
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="md">
              How the model works
            </ButtonLink>
          </div>
        </Card>
      </section>
    </Shell>
  )
}