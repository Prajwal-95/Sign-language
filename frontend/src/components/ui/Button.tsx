import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The single button primitive for the whole product.
 *
 * Visual weight lives in `styles.css` (`.btn-*`) so every control in the app
 * shares one height scale, one radius scale and one depth treatment.
 * Colour communicates hierarchy:
 *   primary   — the one action a screen wants next
 *   violet    — selected secondary action
 *   coral     — supporting secondary action (never destructive)
 *   secondary — neutral, always safe
 *   danger    — destructive only
 *   ghost     — tertiary
 */

export type ButtonVariant = 'primary' | 'violet' | 'coral' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  violet: 'btn-violet',
  coral: 'btn-coral',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  children?: ReactNode
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {}

export interface ButtonLinkProps
  extends CommonProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> {
  to: string
}

function classesFor(props: CommonProps): string {
  return [
    'btn',
    VARIANT_CLASS[props.variant ?? 'secondary'],
    SIZE_CLASS[props.size ?? 'md'],
    props.fullWidth ? 'w-full' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={classesFor({ variant, size, fullWidth, className })} {...rest} />
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  to,
  ...rest
}: ButtonLinkProps) {
  return <Link to={to} className={classesFor({ variant, size, fullWidth, className })} {...rest} />
}

export default Button