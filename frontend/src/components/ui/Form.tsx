import type { ReactNode } from 'react'
import { useId } from 'react'

/**
 * Form controls.
 *
 * Native semantics throughout (real <select>, real <input type="range">, a real
 * button with role="switch"), each wrapped by a visible <label>. Minimum target
 * size is 44px for selects/switches so touch use is comfortable.
 */

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

/**
 * Plain text input. Deliberately thin — the app only needs a controlled
 * single-line field (the custom-word box), so we do not wrap it in extra
 * chrome the way `Field` does for labelled groups.
 */
export function Input({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  type = 'text',
  ...rest
}: {
  id?: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  type?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'id'>) {
  return (
    <input
      id={id}
      type={type}
      className={`control ${className}`}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={onChange}
      {...rest}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function Select({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  className = '',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  ariaLabel?: string
  disabled?: boolean
  className?: string
}) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  return (
    <span className={`control-wrap ${className}`}>
      <select
        id={selectId}
        className="control"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        className="control-chevron"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9.5 6 6 6-6" />
      </svg>
    </span>
  )
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
  disabled,
}: {
  id?: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display: string
  hint?: ReactNode
  disabled?: boolean
}) {
  const generatedId = useId()
  const sliderId = id ?? generatedId
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-ink" htmlFor={sliderId}>
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-brand-600">{display}</span>
      </div>
      <input
        id={sliderId}
        className="range mt-2"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="switch mt-0.5"
      />
    </div>
  )
}