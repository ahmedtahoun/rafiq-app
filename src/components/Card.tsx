import type { HTMLAttributes } from 'react';
import './Card.css';

/** The surface container used for every list row / grouped section in the
    design (rounded, theme surface color, soft shadow). Renders as a plain
    div by default; pass `as="button"` or wrap in an `<a>` for tappable
    rows — Card itself stays presentation-only. */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`.trim()} {...props} />;
}
