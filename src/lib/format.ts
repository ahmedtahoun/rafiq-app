import { useAppStore } from '../store/appStore';
import { translate, type Lang } from './i18n';
import { TODAY_MS } from './mockStore';

/**
 * Number, money and date formatting that follows the app's language
 * rather than the browser's.
 *
 * Before this, Earnings and Main called `toLocaleString()` with no
 * argument — which formats in whatever locale the *browser* is set to, not
 * the one the user picked — and appended a hardcoded Latin "EGP" that
 * stayed Latin on an otherwise Arabic screen. Six other screens got the
 * currency right with their own `isAr ? 'جنيه' : 'EGP'` ternary, so the
 * app disagreed with itself about how to write money.
 */

/**
 * Latin digits in Arabic, deliberately.
 *
 * `ar-EG` renders Arabic-Indic numerals (٥٬٤٠٠), but every other number in
 * this app is Western in both languages — progress percentages, clock
 * times, the prices on Discover. Switching only money and dates would make
 * those the odd ones out, so the Arabic locale is pinned to Latin digits
 * and keeps its own grouping and month names.
 */
const LOCALE: Record<Lang, string> = {
  en: 'en-US',
  ar: 'ar-EG-u-nu-latn',
};

/**
 * Calendar values are built with Date.UTC against the fixed week, so their
 * UTC fields *are* the wall-clock time — AddTask stores a 6 PM task as
 * 18:00 UTC. Formatting them in the device's zone shifted every time by the
 * offset: a 6 PM task read "9:00 PM" in Cairo. CI runs in UTC and could not see it.
 */
const CALENDAR_ZONE = 'UTC';

/** A grouped number: 5400 -> "5,400". */
export function formatAmount(lang: Lang, value: number): string {
  return value.toLocaleString(LOCALE[lang]);
}

/** An amount with the currency word: "5,400 EGP" / "5,400 جنيه". */
export function formatMoney(lang: Lang, value: number): string {
  return `${formatAmount(lang, value)} ${translate(lang, 'currency')}`;
}

/** A short date: "Oct 18, 2025" / "18 أكتوبر 2025". */
export function formatDisplayDate(lang: Lang, ms: number): string {
  return new Date(ms).toLocaleDateString(LOCALE[lang], {
    timeZone: CALENDAR_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A time of day: "6:00 PM" / "6:00 م". */
export function formatTime(lang: Lang, ms: number): string {
  return new Date(ms).toLocaleTimeString(LOCALE[lang], { timeZone: CALENDAR_ZONE, hour: 'numeric', minute: '2-digit' });
}

/**
 * The same time, split into its digits and its AM/PM (or ص/م) marker —
 * for callers that style them differently (Main's "Today's Schedule" badge:
 * a bigger number over a smaller period label). Uses `formatToParts` rather
 * than splitting `formatTime`'s string on a space, which broke the moment
 * that string was Arabic: `Intl` doesn't guarantee digits-then-period
 * ordering across locales, only that the parts themselves are correct.
 */
export function formatTimeParts(lang: Lang, ms: number): { num: string; period: string } {
  const parts = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: CALENDAR_ZONE, hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ms));
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const num = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  return { num, period };
}

/**
 * When a task is due, relative where that reads better and absolute
 * otherwise: "Due today, 6:00 PM", "Due tomorrow", "Due Fri, Oct 24".
 *
 * Everything before this lived in the stored string, which is why a task
 * could only ever be due in the language it was written in.
 */
export function formatTaskDue(lang: Lang, dueAtMs: number, hasTime = false, todayMs: number): string {
  const DAY = 86400000;
  const dayStart = todayMs;
  const time = hasTime ? formatTime(lang, dueAtMs) : '';

  if (dueAtMs >= dayStart && dueAtMs < dayStart + DAY) {
    return hasTime
      ? translate(lang, 'taskDueTodayAt', { time })
      : translate(lang, 'taskDueToday');
  }
  if (dueAtMs >= dayStart + DAY && dueAtMs < dayStart + 2 * DAY) {
    return hasTime
      ? translate(lang, 'taskDueTomorrowAt', { time })
      : translate(lang, 'taskDueTomorrow');
  }
  // Weekday included, as the design's own "Due Fri, Oct 24" had it.
  const date = new Date(dueAtMs).toLocaleDateString(LOCALE[lang], {
    timeZone: CALENDAR_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return hasTime
    ? translate(lang, 'taskDueOnAt', { date, time })
    : translate(lang, 'taskDueOn', { date });
}

/**
 * A confirmed next session: "Today, 10:00 AM" / "Thu, 10:00 AM" —
 * the same convention `Client.nextSession` used to hold as a pre-composed
 * English sentence ("Next: Today, 10:00 AM"). The caller adds its own
 * "Next: " prefix where the design wants one; this only renders the
 * date/time body, which is what nearly every screen actually needed after
 * stripping that prefix back off.
 */
export function formatNextSession(lang: Lang, atMs: number, todayMs: number): string {
  const DAY = 86400000;
  const time = formatTime(lang, atMs);
  const isToday = atMs >= todayMs && atMs < todayMs + DAY;
  const date = isToday
    ? translate(lang, 'today')
    : new Date(atMs).toLocaleDateString(LOCALE[lang], { timeZone: CALENDAR_ZONE, weekday: 'short' });
  return translate(lang, 'nextSessionAt', { date, time });
}

/** The same, bound to the active language, for use inside a component. */
export function useFormat() {
  const lang = useAppStore((s) => s.lang);
  return {
    amount: (value: number) => formatAmount(lang, value),
    money: (value: number) => formatMoney(lang, value),
    date: (ms: number) => formatDisplayDate(lang, ms),
    time: (ms: number) => formatTime(lang, ms),
    timeParts: (ms: number) => formatTimeParts(lang, ms),
    taskDue: (dueAtMs: number, hasTime = false) => formatTaskDue(lang, dueAtMs, hasTime, TODAY_MS),
    nextSession: (atMs: number) => formatNextSession(lang, atMs, TODAY_MS),
  };
}
