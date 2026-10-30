import { ButtonLink } from '../ui/Button'
import TranslatorPreview from './TranslatorPreview'
import { Shell } from '../ui/Card'

/**
 * Two-column hero. The right-hand column is a static, clearly-labelled preview
 * of the translator workspace; the left column carries the message and exactly
 * two calls to action.
 */
export default function Hero() {
  return (
    <section className="wash-hero border-b border-line">
      <Shell className="grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-14 lg:py-20">
        <div className="min-w-0">
          <p className="kicker">Real-time Indian Sign Language</p>

          <h1 className="mt-4 font-display text-[38px] font-bold leading-[1.06] text-ink sm:text-5xl lg:text-[56px]">
            Speak with your hands.
          </h1>

          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-secondary sm:text-lg">
            Translate supported Indian Sign Language gestures into readable text and speech
            through a webcam-based recognition interface.
          </p>

          <div className="mt-8 flex flex-wrap gap-3.5">
            <ButtonLink to="/translator" variant="primary" size="lg">
              Start Translating
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.1}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4.6 12h14.2M13.4 6.6 18.8 12l-5.4 5.4" />
              </svg>
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="lg">
              How It Works
            </ButtonLink>
          </div>

          <p className="mt-6 flex max-w-[46ch] items-start gap-2 text-[13px] leading-relaxed text-ink-secondary">
            <svg
              className="mt-0.5 flex-none text-brand-500"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3.2 5.2 6v5.6c0 3.9 2.8 7.4 6.8 9.2 4-1.8 6.8-5.3 6.8-9.2V6L12 3.2Z" />
              <path d="m9.2 12 2 2 3.6-4" />
            </svg>
            <span>
              Privacy-first: hand landmarks are computed in your browser and only the
              coordinates travel to the backend. Video frames never leave your device.
            </span>
          </p>
        </div>

        <div className="min-w-0">
          <TranslatorPreview />
        </div>
      </Shell>
    </section>
  )
}