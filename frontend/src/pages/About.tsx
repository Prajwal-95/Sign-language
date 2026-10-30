import { useEffect } from 'react'
import PageHeader from '../components/ui/PageHeader'
import Callout from '../components/ui/Callout'
import { ButtonLink } from '../components/ui/Button'
import { Card, Shell, accentIconClass, accentTextClass, type Accent } from '../components/ui/Card'
import Icon, { type IconName } from '../components/ui/Icon'
import { FEATURES_PER_FRAME, SEQUENCE_LENGTH, SIGN_COUNT } from '../lib/projectData'

interface Highlight {
  icon: IconName
  accent: Accent
  title: string
  text: string
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: 'shield',
    accent: 'brand',
    title: 'Landmarks stay on your device',
    text: 'MediaPipe hand and face tracking run inside the browser. Only 21-point coordinates are sent to the backend over a WebSocket — the camera feed is never transmitted, recorded or stored.',
  },
  {
    icon: 'cpu',
    accent: 'teal',
    title: 'A real temporal model',
    text: `A gated recurrent unit classifies ${SEQUENCE_LENGTH}-frame sequences of ${FEATURES_PER_FRAME}-value two-hand feature vectors. Static hand poses are not enough to disambiguate ISL motion, which is why the model is sequential.`,
  },
  {
    icon: 'globe',
    accent: 'violet',
    title: 'Three output languages',
    text: 'Every recognised sign is rendered and spoken in English, हिन्दी or ಕನ್ನಡ, including per-language voice codes so the browser picks a matching system voice.',
  },
  {
    icon: 'layers',
    accent: 'coral',
    title: 'Built to extend',
    text: 'The vocabulary lives in one file, the feature pipeline is shared between training and inference, and the in-app recorder lets you add your own webcam samples without touching the code.',
  },
]

const FRONTEND_STACK = [
  'React 18',
  'TypeScript',
  'Vite',
  'Tailwind CSS',
  'MediaPipe Tasks Vision',
  'React Router',
  'Web Speech API',
  'WebSocket',
]

const BACKEND_STACK = ['FastAPI', 'PyTorch', 'NumPy', 'Uvicorn']

export default function About() {
  useEffect(() => {
    document.title = 'About · ISL to Speech'
  }, [])

  return (
    <Shell className="wash-peach py-10 sm:py-14">
      <PageHeader
        eyebrow="About the project"
        title="A bridge between hands and voice"
        lead="Real-Time Indian Sign Language (ISL) to Speech Conversion — a final-year computer science project that turns the motion of your hands into words you can read and hear."
      />

      {/* Purpose */}
      <section aria-labelledby="purpose-heading" className="mt-12">
        <h2 id="purpose-heading" className="text-xl font-bold text-ink sm:text-2xl">
          What problem it addresses
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card hoverable className="p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Most deaf and hard-of-hearing people depend on a human interpreter for everyday
              conversation, and an interpreter is not always available — in a clinic, a shop, a
              classroom or at home at night. Existing automatic sign-language tools are usually
              either research demos or cloud services that require an upload.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
              This project builds the smallest genuinely useful version of that tool: a fixed set
              of frequently used words, recognised live from an ordinary webcam, on the user's own
              machine, with no account and no upload.
            </p>
          </Card>

          <Card hoverable accent="violet" className="p-6">
            <h3 className="text-[17px] font-semibold text-ink">What it actually does</h3>
            <ul className="mt-3 space-y-2.5">
              {[
                'Opens a webcam and tracks up to two hands in real time',
                'Isolates the primary user so other people in frame do not confuse the model',
                'Classifies a completed sign and appends its word to a running sentence',
                'Translates the sentence into English, Hindi or Kannada',
                'Speaks the result, on demand or automatically',
                'Lets you record your own samples to improve recognition for your hands',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-secondary">
                  <Icon name="check" size={16} className="mt-1 flex-none text-violet-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Highlights */}
      <section aria-labelledby="design-heading" className="mt-12">
        <h2 id="design-heading" className="text-xl font-bold text-ink sm:text-2xl">
          Design decisions
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <Card key={item.title} hoverable accent={item.accent} className="p-6">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl border ${accentIconClass(item.accent)}`}
              >
                <Icon name={item.icon} size={21} />
              </span>
              <h3 className={`mt-4 text-[17px] font-semibold ${accentTextClass(item.accent)}`}>
                {item.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">{item.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section aria-labelledby="stack-heading" className="mt-12">
        <h2 id="stack-heading" className="text-xl font-bold text-ink sm:text-2xl">
          Technology stack
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-[15px] font-semibold text-ink">Frontend</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {FRONTEND_STACK.map((item) => (
                <li key={item} className="chip">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card accent="teal" className="p-6">
            <h3 className="text-[15px] font-semibold text-ink">Backend & model</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {BACKEND_STACK.map((item) => (
                <li key={item} className="chip">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-secondary">
              The trained GRU checkpoint is stored at{' '}
              <code className="code-inline">models/word_model.pt</code> with its class list and
              sequence length in <code className="code-inline">models/word_classes.json</code>.
            </p>
          </Card>
        </div>
      </section>

      <Callout tone="warn" title="Honest scope" className="mt-10">
        This system recognises a <strong>fixed vocabulary of {SIGN_COUNT - 1} ISL word signs</strong>{' '}
        (plus a hand-down pause class) — it is not a complete ISL translator. Indian Sign Language
        is a full language with its own grammar and thousands of signs; continuous sentence-level
        translation is future work. Reported accuracy comes from a held-out offline test set and is
        not a prediction of live performance with an unseen signer, background or lighting.
      </Callout>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink to="/translator" variant="primary" size="lg">
          Try the translator
        </ButtonLink>
        <ButtonLink to="/how-it-works" variant="secondary" size="lg">
          See how it works
        </ButtonLink>
      </div>
    </Shell>
  )
}