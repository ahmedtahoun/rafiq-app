import { useId } from 'react';
import { MARK_FROM, MARK_INK, MARK_R_PATH, MARK_TO, markGlyphTransform } from '../lib/logoMark';

/**
 * The Rafiq Pro mark, inline so it works offline and needs no font. It
 * fills its container: the container sets the size, the corner radius
 * (overflow: hidden) and any shadow, so each screen keeps its own.
 *
 * Decorative wherever it sits beside the app's name, which is everywhere it
 * is used today, hence aria-hidden. A logo is not directional: it never gets
 * .icon-directional and is not mirrored in Arabic.
 */
export function Logo({ className }: { className?: string }) {
  // Two marks on one page (a screen and its transition) must not share a
  // gradient id, or the second paints with the first's.
  const gradient = `logo-grad-${useId().replace(/:/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-logo>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARK_FROM} />
          <stop offset="1" stopColor={MARK_TO} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gradient})`} />
      <path d={MARK_R_PATH} transform={markGlyphTransform(0.33)} fill={MARK_INK} />
    </svg>
  );
}
