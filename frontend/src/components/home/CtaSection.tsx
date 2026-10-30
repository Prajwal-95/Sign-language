import { ButtonLink } from '../ui/Button'
import { Shell } from '../ui/Card'
import { formatAccuracy, TEST_ACCURACY, TEST_SAMPLE_COUNT } from '../../lib/projectData'

/** Closing call to action. */
export default function CtaSection() {
  return (
    <section aria-labelledby="cta-heading" className="wash-cta">
      <Shell className="py-14 sm:py-16">
        <div className="surface flex flex-col items-start gap-6 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:p-12">
          <div className="min-w-0 max-w-2xl">
            <h2 id="cta-heading" className="text-2xl font-bold text-ink sm:text-3xl">
              Turn on the camera and try a real sign
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
              Start the translator, raise your hand in front of the webcam, perform the sign and
              lower your hand. The recognised word joins your sentence and can be spoken
              immediately or automatically.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-subtle px-3 py-1.5 text-[12px] font-medium text-ink-secondary">
              Model test accuracy {formatAccuracy(TEST_ACCURACY)} on {TEST_SAMPLE_COUNT} held-out
              sequences — offline evaluation, not a live guarantee.
            </p>
          </div>

          <div className="flex flex-none flex-wrap gap-3">
            <ButtonLink to="/translator" variant="primary" size="lg">
              Start Translating
            </ButtonLink>
            <ButtonLink to="/about" variant="secondary" size="lg">
              About the project
            </ButtonLink>
          </div>
        </div>
      </Shell>
    </section>
  )
}