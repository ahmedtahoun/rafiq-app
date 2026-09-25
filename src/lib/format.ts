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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A time of day: "6:00 PM" / "6:00 م". */
export function formatTime(lang: Lang, ms: number): string {
  return new Date(ms).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' });
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return hasTime
    ? translate(lang, 'taskDueOnAt', { date, time })
    : translate(lang, 'taskDueOn', { date });
}

/** The same three, bound to the active language, for use inside a component. */
export function useFormat() {
  const lang = useAppStore((s) => s.lang);
  return {
    amount: (value: number) => formatAmount(lang, value),
    money: (value: number) => formatMoney(lang, value),
    date: (ms: number) => formatDisplayDate(lang, ms),
    time: (ms: number) => formatTime(lang, ms),
    taskDue: (dueAtMs: number, hasTime = false) => formatTaskDue(lang, dueAtMs, hasTime, TODAY_MS),
  };
}
