// Every specialty icon from the design's onboarding specialty picker,
// ported 1:1 (same paths). Looked up by key rather than one icon per
// import so the specialty list (src/lib/specialties.ts) can stay data,
// not a giant if/else of JSX.

export type SpecialtyIconKey =
  | 'life' | 'meditation' | 'breathwork' | 'stress' | 'sleep'
  | 'yoga' | 'calisthenics' | 'fitness' | 'nutrition' | 'freeDiving' | 'scuba'
  | 'relationship' | 'breakup' | 'parenting' | 'career';

interface IconProps {
  color?: string;
  size?: number;
}

export function SpecialtyIcon({ specialty, color = 'currentColor', size = 15 }: { specialty: SpecialtyIconKey } & IconProps) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const fill = { fill: color, stroke: 'none' };

  switch (specialty) {
    case 'life':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M14.5 9.5L12 15l-2.5-2 2.5-3.5z" />
        </svg>
      );
    case 'meditation':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M4 16c3-1 5-1 8-1s5 0 8 1" />
          <path d="M12 15V9" />
          <path d="M12 12c-2-1.5-3-4-2-6.5C12 6 13 8.5 12 12z" />
          <path d="M12 12c2-1.5 3-4 2-6.5C12 6 11 8.5 12 12z" />
        </svg>
      );
    case 'breathwork':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M3 8h11a3 3 0 1 0-2.5-4.5" />
          <path d="M3 12h15a3 3 0 1 1-2.5 4.5" />
          <path d="M3 16h7" />
        </svg>
      );
    case 'stress':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="M5 7l-3 6a3 3 0 0 0 6 0z" />
          <path d="M19 7l-3 6a3 3 0 0 0 6 0z" />
        </svg>
      );
    case 'sleep':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...fill}>
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
        </svg>
      );
    case 'yoga':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v6" />
          <path d="M12 13l-5 5M12 13l5 5M7 9l5 3 5-3" />
        </svg>
      );
    case 'calisthenics':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M4 7h16" />
          <path d="M8 7v12" />
          <path d="M16 7v12" />
        </svg>
      );
    case 'fitness':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
          <circle cx="5" cy="12" r="2.5" />
          <circle cx="19" cy="12" r="2.5" />
          <path d="M7.5 12h9" />
        </svg>
      );
    case 'nutrition':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...fill}>
          <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3.5.2 1.5 1.3 2 2 1-1-2 .5-4 2-4.5-1 1.5-.5 3 .5 3.5C13 7 12 4.5 12 2z" />
        </svg>
      );
    case 'freeDiving':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M2 8c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" />
          <path d="M2 14c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" />
        </svg>
      );
    case 'scuba':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <rect x="3" y="6" width="18" height="12" rx="6" />
          <line x1="12" y1="6" x2="12" y2="18" />
        </svg>
      );
    case 'relationship':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...fill}>
          <path d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.5 8 19.5 11.5 17 15.65 12 20 12 20z" />
        </svg>
      );
    case 'breakup':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <path d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.5 8 19.5 11.5 17 15.65 12 20 12 20z" />
          <path d="M13 5l-2 5 3 2-3 5" />
        </svg>
      );
    case 'parenting':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <circle cx="8" cy="7" r="3" />
          <path d="M2 20c.7-3.4 3-5 6-5s5.3 1.6 6 5" />
          <circle cx="17.5" cy="9" r="2" />
          <path d="M14 20c.4-2.3 1.8-3.5 3.5-3.5s3.1 1.2 3.5 3.5" />
        </svg>
      );
    case 'career':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
  }
}
