import type { MessageKey } from './i18n';

/**
 * Where to send someone who is in danger, in crisis, or being hurt.
 *
 * Egypt first, because that is where Rafiq Pro launches, with a line for
 * everywhere else. Shown on both Terms screens, on the public terms page,
 * and from a member's onboarding — the three places a member can reach
 * without already being in a conversation with a coach.
 *
 * ────────────────────────────────────────────────────────────────────────
 * EVERY NUMBER HERE IS NULL ON PURPOSE, AND THAT IS A LAUNCH BLOCKER.
 *
 * A wrong number on this screen is worse than no number: someone dials it
 * at the worst moment of their life and reaches a disconnected line. So
 * nothing was guessed, transcribed from memory, or inferred. `phone` stays
 * null until Ahmed has dialled it.
 *
 * The organisation names are leads, not facts — they were written from
 * general knowledge with no way to check any of them from this sandbox.
 * Confirm for each one, before launch:
 *   1. the organisation still exists and still runs a line;
 *   2. the number, dialled;
 *   3. the hours — several of these are not 24/7, and a row that does not
 *      say so is misleading at 3am;
 *   4. whether it answers in Arabic, in English, or both.
 *
 * Add a row, or delete one that turns out not to exist. An empty list
 * renders as "contact your local emergency services" and nothing else,
 * which is honest; a list of dead numbers is not.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface CrisisResource {
  /** Stable id, so a test can name a row without matching on copy. */
  id: string;
  nameKey: MessageKey;
  /** What this line is for, in one short phrase. */
  forKey: MessageKey;
  /** Digits as dialled locally. **null until confirmed** — see above. */
  phone: string | null;
  /** When it answers, if not around the clock. Null = not yet known. */
  hoursKey: MessageKey | null;
}

export const CRISIS_RESOURCES: CrisisResource[] = [
  { id: 'emergency',    nameKey: 'crisisEmergencyName',    forKey: 'crisisEmergencyFor',    phone: null, hoursKey: null },
  { id: 'mentalHealth', nameKey: 'crisisMentalHealthName', forKey: 'crisisMentalHealthFor', phone: null, hoursKey: null },
  { id: 'befrienders',  nameKey: 'crisisBefriendersName',  forKey: 'crisisBefriendersFor',  phone: null, hoursKey: null },
  { id: 'women',        nameKey: 'crisisWomenName',        forKey: 'crisisWomenFor',        phone: null, hoursKey: null },
  { id: 'child',        nameKey: 'crisisChildName',        forKey: 'crisisChildFor',        phone: null, hoursKey: null },
];

/** True once every row has a number. False is the pre-launch state, and
    `tests/crisis-resources.spec.js` asserts the unconfirmed rows still
    render something a person can act on rather than a blank. */
export function crisisNumbersConfirmed(): boolean {
  return CRISIS_RESOURCES.every((r) => r.phone !== null);
}

/** `tel:` strips anything that is not a digit or a leading +, so a number
    written with spaces for readability still dials. */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}
