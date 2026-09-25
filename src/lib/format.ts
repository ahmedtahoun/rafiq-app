import { useAppStore } from '../store/appStore';
import { translate, type Lang } from './i18n';

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

/** The same three, bound to the active language, for use inside a component. */
export function useFormat() {
  const lang = useAppStore((s) => s.lang);
  return {
    amount: (value: number) => formatAmount(lang, value),
    money: (value: number) => formatMoney(lang, value),
    date: (ms: number) => formatDisplayDate(lang, ms),
  };
}
