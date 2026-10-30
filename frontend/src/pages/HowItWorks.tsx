import { useEffect } from 'react'
import PageHeader from '../components/ui/PageHeader'
import { ButtonLink } from '../components/ui/Button'
import { Card, Shell, accentIconClass, type Accent } from '../components/ui/Card'
import Icon, { type IconName } from '../components/ui/Icon'
import { FEATURES_PER_FRAME, SEQUENCE_LENGTH } from '../lib/projectData'

type RunsIn = 'Browser' | 'Backend' | 'Transport' | 'Both'

interface Stage {
  icon: IconName
  accent: Accent
  title: string
  text: string
  runsIn: RunsIn
}

/**
 * The actual implementation, in execution order. Each stage declares whether it
 * runs in the browser or on the backend so the boundary is never blurred.
 */
const STAGES: Stage[] = [
  {
    icon: 'camera',
    accent: 'brand',
    runsIn: 'Browser',
    title: 'Webcam input',
    text: 'The app requests a 640x480 video stream through getUserMedia and plays it into a video element. Nothing is recorded and no frames are stored.',
  },
  {
    icon: 'hand',
    accent: 'teal',
    runsIn: 'Browser',
    title: 'Hand-landmark extraction',
    text: 'MediaPipe HandLandmarker runs in WebAssembly in a requestAnimationFrame loop, returning 21 landmarks (x, y, z) per hand for up to two hands. These are drawn straight onto the video as an overlay.',
  },
  {
    icon: 'users',
    accent: 'violet',
    runsIn: 'Browser',
    title: 'Primary-user filtering',
    text: 'A face detector estimates the primary user and an implied torso region. Only hands associated with that person are forwarded; when the tracked user changes, the backend sequence is reset so motions from two people are never mixed.',
  },
  {
    icon: 'link',
    accent: 'coral',
    runsIn: 'Transport',
    title: 'Landmark stream over WebSocket',
    text: 'Each frame is reduced to compact landmark JSON and pushed over a single WebSocket. The browser sends only coordinates — this is the entire privacy boundary of the application.',
  },
  {
    icon: 'cpu',
    accent: 'teal',
    runsIn: 'Backend',
    title: 'Sequence processing',
    text: `The server turns each frame into a ${FEATURES_PER_FRAME}-value two-hand feature vector (each hand is centred on the wrist and scaled by hand size, then flattened with a handedness flag). Frames are buffered while your hand is up and resampled to ${SEQUENCE_LENGTH} steps when it comes down.`,
  },
  {
    icon: 'speaker',
    accent: 'brand',
    runsIn: 'Both',
    title: 'Prediction, translation and speech',
    text: 'The GRU classifies the sequence and returns a label with a confidence score; a sign is accepted only above the confidence threshold. The frontend translates the accepted sign ID into the selected language and appends it to the sentence buffer. It then speaks it through the first engine that can genuinely produce that language: a system voice if one is installed, otherwise the local offline speech service. No text leaves your machine and no account is required.',
  },
]

const RUNS_IN_CLASS: Record<RunsIn, string> = {
  Browser: 'border-brand-200 bg-brand-50 text-brand-700',
  Backend: 'border-violet-200 bg-violet-50 text-violet-700',
  Transport: 'border-coral-200 bg-coral-50 text-coral-700',
  Both: 'border-teal-200 bg-teal-50 text-teal-700',
}

export default function HowItWorks() {
  useEffect(() => {
    document.title = 'How it works · ISL to Speech'
  }, [])

  return (
    <Shell className="band-ivory py-10 sm:py-14">
      <PageHeader
        eyebrow="How it works"
        title="From a raised hand to a spoken word"
        lead="Six stages, each one either in your browser or on the backend. Nothing is hidden in the middle — here is exactly where the work happens."
      />

      <ol className="mt-12 space-y-4">
        {STAGES.map((stage, index) => (
          <li key={stage.title}>
            <Card hoverable className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-6">
              <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
                <span
                  className={`grid h-12 w-12 flex-none place-items-center rounded-xl border ${accentIconClass(stage.accent)}`}
                >
                  <Icon name={stage.icon} size={22} />
                </span>
                <span className="font-display text-sm font-bold text-ink-muted sm:hidden">
                  Step {index + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="hidden font-display text-sm font-bold text-ink-muted sm:block">
                    Step {index + 1}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${RUNS_IN_CLASS[stage.runsIn]}`}
                  >
                    Runs in the {stage.runsIn.toLowerCase()}
                  </span>
                </div>
                <h2 className="mt-2 text-[17px] font-semibold text-ink">{stage.title}</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-secondary">{stage.text}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card accent="violet" className="mt-10 flex flex-col items-start gap-5 p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-xl font-bold text-ink">Watch all of it at once</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">
            The translator shows the live hand skeleton, the accepted sign, its confidence and the
            sentence being built — all updating in real time during a sign.
          </p>
        </div>
        <ButtonLink to="/translator" variant="primary" size="lg" className="flex-none">
          Open the Translator
        </ButtonLink>
      </Card>
    </Shell>
  )
}