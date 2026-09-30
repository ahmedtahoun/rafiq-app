/**
 * The Rafiq Pro mark: a white Lora Bold "R" on the accent gradient. The one
 * definition both the in-app logo (src/components/Logo.tsx) and the native
 * icons and splash screens (scripts/render-brand-assets.mjs → assets/ →
 * @capacitor/assets) are drawn from, so the two cannot drift apart.
 *
 * The R is the glyph's outline, not text, so it looks the same offline,
 * before the font loads, in Arabic, and at any system text size.
 */

/** Lora Bold (700) "R", in font units: 1000 per em, y up, baseline at 0. */
export const MARK_R_PATH =
  'M50 0V66Q73 67 88.5 72.0Q104 77 112.5 95.0Q121 113 121 153V536Q121 563 122.5 588.0Q124 613 125 626Q109 625 85.0 624.5Q61 624 50 623V700Q121 701 192.0 701.0Q263 701 334 702Q422 703 487.0 682.0Q552 661 587.0 614.0Q622 567 620 487Q619 445 599.5 407.0Q580 369 541.5 340.0Q503 311 444 294Q463 286 481.5 268.0Q500 250 513 230L560 160Q582 126 599.0 106.0Q616 86 633.0 76.5Q650 67 672 66V0H507Q489 13 471.5 37.5Q454 62 434 94L360 214Q347 234 337.5 248.0Q328 262 318 272Q302 272 291.0 272.0Q280 272 266 272V165Q266 137 265.0 112.0Q264 87 262 74Q273 75 290.0 75.5Q307 76 323.5 76.5Q340 77 347 77V0ZM314 344Q370 344 404.0 360.5Q438 377 453.5 410.5Q469 444 469 495Q469 543 454.0 570.5Q439 598 416.5 611.5Q394 625 371.0 628.5Q348 632 333 632Q312 632 297.0 627.0Q282 622 274.0 605.0Q266 588 266 553V348Q277 347 289.0 345.5Q301 344 314 344Z';

/** The glyph's ink box in font units (fontTools BoundsPen). */
const R_BOX = { xMin: 50, xMax: 672, yMin: 0, yMax: 702 };

export const MARK_FROM = '#B75C3D'; // --accent
export const MARK_TO = '#7A3D26';
export const MARK_INK = '#FFFFFF';

/**
 * Places the R centred in a 100×100 box, its height `share` of the box.
 * 0.33 matches the CSS mark it replaced (26px Lora on 56px); a home-screen
 * icon wants it larger to read at 40px.
 */
export function markGlyphTransform(share: number): string {
  const s = (share * 100) / (R_BOX.yMax - R_BOX.yMin);
  const tx = 50 - ((R_BOX.xMin + R_BOX.xMax) / 2) * s;
  const ty = 50 + ((R_BOX.yMin + R_BOX.yMax) / 2) * s;
  return `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})`;
}
