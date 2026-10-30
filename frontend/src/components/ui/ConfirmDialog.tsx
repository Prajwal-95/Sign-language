import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * Confirmation dialog built on the native <dialog> element so focus trapping,
 * Escape-to-close and inertness come from the platform rather than hand-rolled
 * JavaScript.
 */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  children,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary' | 'violet'
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCancel()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onCancel])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      onClick={(event) => {
        // Clicking the backdrop (the <dialog> element itself) dismisses.
        if (event.target === ref.current) onCancel()
      }}
    >
      <div className="p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{description}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}