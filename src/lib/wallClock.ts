/**
 * Real timestamps as the app's calendar values.
 *
 * Every date in the app's screens is "wall-clock ms": a local date and time
 * stored in a Date's UTC fields (a 6 PM task is 18:00 UTC), which is why
 * format.ts formats calendar values in UTC. mockStore's are built that way
 * against the fixed fictional week (TODAY_MS).
 *
 * Supabase stores real instants (timestamptz). Converting them here, at the
 * edge of the data layer, lets every screen, formatter and comparison that
 * already works on calendar values work on real rows unchanged: 01:30 on
 * the 28th in Cairo reads back as 01:30 on the 28th, not 22:30 on the 27th.
 * The one thing that has to change on a screen showing real rows is what
 * "today" is — wallTodayMs() instead of TODAY_MS.
 *
 * A date-only value (a task due "tomorrow") is stored as local midnight.
 */

/** A timestamptz from Supabase → wall-clock ms in the device's zone. */
export function toWallMs(at: string | number | Date): number {
  const d = new Date(at);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** Wall-clock ms → the real instant, as an ISO string for a timestamptz column. */
export function fromWallMs(wallMs: number): string {
  const w = new Date(wallMs);
  return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds()).toISOString();
}

/** The start of today on the device, as wall-clock ms: the real
    counterpart of mockStore's TODAY_MS. */
export function wallTodayMs(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Now, as wall-clock ms. */
export function wallNowMs(now: Date = new Date()): number {
  return toWallMs(now);
}
