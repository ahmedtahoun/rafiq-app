/** Small shared icon set. Directional icons (back/forward chevrons) carry
    className="icon-directional" so tokens.css can mirror them under
    [dir="rtl"] — real CSS logical flipping, instead of the design
    prototype's per-language literal path-data swap. */

export function ChevronIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg className="icon-directional" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ArrowForwardIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg className="icon-directional" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function PersonIcon({ size = 21, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.7" />
      <path d="M4.5 20c1.1-4.4 4-6.6 7.5-6.6s6.4 2.2 7.5 6.6" />
    </svg>
  );
}

export function CoachIcon({ size = 21, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.7" />
      <path d="M4.5 20c1.1-4.4 4-6.6 7.5-6.6s6.4 2.2 7.5 6.6" />
      <path d="M17.5 2.5c1.3.5 2.2 1.8 2.2 3.3s-.9 2.8-2.2 3.3" />
    </svg>
  );
}
