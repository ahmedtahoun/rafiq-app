/** Same darken() every screen in the design prototype carried its own copy of. */
export function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
