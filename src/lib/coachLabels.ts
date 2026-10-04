/**
 * A coach's specialties and languages, in the app's language.
 *
 * Both are stored as English values: a coach's title is the specialties
 * they picked in Edit Profile joined with " · " (EditProfile.tsx), and
 * their languages are LANGUAGE_OPTIONS' names. Printed raw they read
 * English on an Arabic screen (#95). Every screen that shows them goes
 * through here, so a specialty reads the same on Discover, a coach's page,
 * the coach's own Preview and the member's My Pro.
 *
 * A value that isn't known (a specialty since renamed, a language added
 * later) is shown as stored, isolated so it can't reorder the Arabic
 * around it.
 */
import { isolate, type MessageKey } from './i18n';
import { SPECIALTIES } from './specialties';

type Translate = (key: MessageKey) => string;

/** Directory languages reuse Discover's filter labels. */
const LANGUAGE_KEYS: Record<string, MessageKey> = {
  Arabic: 'discoverLanguageArabic',
  English: 'discoverLanguageEnglish',
  French: 'discoverLanguageFrench',
};

export function specialtyLabels(title: string, t: Translate): string[] {
  return title
    .split(' · ')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const def = SPECIALTIES.find((s) => s.value === value);
      return def ? t(def.labelKey) : isolate(value);
    });
}

export function languageLabel(language: string, t: Translate): string {
  const key = LANGUAGE_KEYS[language];
  return key ? t(key) : isolate(language);
}
