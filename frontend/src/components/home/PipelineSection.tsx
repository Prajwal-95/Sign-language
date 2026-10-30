import Icon, { type IconName } from '../ui/Icon'
import { Shell, accentIconClass, accentTextClass, type Accent } from '../ui/Card'

interface Step {
  number: number
  title: string
  text: string
  runIn: 'Browser' | 'Backend'
  accent: Accent
  icon: IconName
}

/**
 * The real pipeline, in order. Each card states whether the work happens in the
 * browser or on the backend so the two are never conflated.
 */
const STEPS: Step[] = [
  {
    number: 1,
    title: 'Camera',
    text: 'The browser opens a webcam stream at 640x480 and processes every frame locally.',
    runIn: 'Browser',
    accent: 'brand',
    icon: 'camera',
  },
  {
    number: 2,
    title: 'Hand landmarks',
    text: 'MediaPipe locates 21 points on each of up to two hands, and only those coordinates are sent onward.',
    runIn: 'Browser',
    accent: 'teal',
    icon: 'hand',
  },
  {
    number: 3,
    title: 'Neural network',
    text: 'The backend turns each frame into 128 features, resamples the motion into a 32-frame sequence and classifies it with a GRU.',
    runIn: 'Backend',
    accent: 'violet',
    icon: 'cpu',
  },
  {
    number: 4,
    title: 'Speech output',
    text: 'The accepted sign becomes a word in your sentence, written and spoken in English, Hindi or Kannada.',
    runIn: 'Browser',
    accent: 'coral',
    icon: 'speaker',
  },
]

export default function PipelineSection() {
  return (
    <section aria-labelledby="pipeline-heading" className="band-ivory border-b border-line">
      <Shell className="py-14 sm:py-16">
        <div className="max-w-2xl">
          <p className="kicker">The pipeline</p>
          <h2 id="pipeline-heading" className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            From movement to voice, in four stages
          </h2>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-secondary">
            A sign is recognised when you lower your hand. That hand-down moment is the word
            boundary the model was trained to expect.
          </p>
        </div>

        <ol className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.number} className="surface card-hover flex flex-col p-5">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`grid h-11 w-11 place-items-center rounded-xl border ${accentIconClass(step.accent)}`}
                >
                  <Icon name={step.icon} size={21} />
                </span>
                <span className="font-display text-2xl font-bold text-line-strong" aria-hidden="true">
                  {String(step.number).padStart(2, '0')}
                </span>
              </div>

              <h3 className={`mt-4 text-[17px] font-semibold ${accentTextClass(step.accent)}`}>
                {step.title}
              </h3>
              <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-secondary">
                {step.text}
              </p>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Step {step.number} · Runs in the {step.runIn.toLowerCase()}
              </p>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  )
}