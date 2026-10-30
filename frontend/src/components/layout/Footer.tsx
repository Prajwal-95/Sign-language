import { Link } from 'react-router-dom'
import BrandMark, { NAV_LINKS } from './Brand'
import { Shell } from '../ui/Card'
import { formatAccuracy, TEST_ACCURACY } from '../../lib/projectData'

/**
 * Compact footer. It repeats only facts that are verifiable in this repository
 * and links only to routes that exist.
 */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-warm/70">
      <Shell className="py-9">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <BrandMark size="sm" />
            <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
              A final-year computer science project that turns a defined set of Indian Sign
              Language word signs into readable text and spoken audio, in English, Hindi and
              Kannada.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 sm:grid-cols-3">
            {NAV_LINKS.filter((link) => link.to !== '/').map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="-mx-1 inline-flex min-h-[32px] items-center rounded-lg px-1 py-1 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-warm-500/40 hover:text-brand-600"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="max-w-xs rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Verified test result
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatAccuracy(TEST_ACCURACY)} accuracy
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
              Measured on a held-out test set during training. It is an offline evaluation of
              the model, not a guarantee of live webcam accuracy.
            </p>
          </div>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-muted">
          Recognises a fixed vocabulary of 19 ISL word signs (20 classes including the
          hand-down pause token) — it is not a complete ISL translator. Hand landmark
          coordinates are computed in your browser; video frames are never uploaded.
        </p>
      </Shell>
    </footer>
  )
}