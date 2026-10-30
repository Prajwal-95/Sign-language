import { useEffect } from 'react'
import EmptyState from './ui/EmptyState'
import { Shell } from './ui/Card'
import { ButtonLink } from './ui/Button'
import { NAV_LINKS } from './layout/Brand'

/** 404 route — same shell, same spacing, no invented destinations. */
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · ISL to Speech'
  }, [])

  return (
    <Shell className="py-16">
      <div className="mx-auto max-w-xl surface">
        <EmptyState
          icon="link"
          title={<h1 className="text-2xl font-bold text-ink">That page does not exist</h1>}
          description="The address you followed is not part of this application. Pick a destination below."
          action={
            <ButtonLink to="/" variant="primary" size="md">
              Back to home
            </ButtonLink>
          }
        />
        <nav aria-label="Available pages" className="flex flex-wrap justify-center gap-2 border-t border-line px-6 py-5">
          {NAV_LINKS.map((link) => (
            <ButtonLink key={link.to} to={link.to} variant="secondary" size="sm">
              {link.label}
            </ButtonLink>
          ))}
        </nav>
      </div>
    </Shell>
  )
}