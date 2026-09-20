import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** The pill CTA used everywhere in the design (Welcome's "Next", every
    sheet's confirm button, etc.) — primary is solid accent with a glow
    shadow, secondary is a neutral filled pill, ghost is text-only, danger
    is the red destructive-action style (delete/cancel confirmations). */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className}`.trim()} {...props} />;
}
