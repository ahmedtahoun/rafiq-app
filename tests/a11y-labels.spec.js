import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Icon-only buttons carry their whole meaning in `aria-label`. For a long
 * time 52 of those labels were English string literals, so an Arabic
 * screen-reader user heard "Toggle dark mode" and "Remind via message" on
 * an otherwise fully translated screen.
 *
 * These are source checks rather than browser checks on purpose: the
 * failure is a literal in the JSX, and catching it at the source names the
 * file and the line instead of reporting a mystery string in a rendered
 * tree.
 */

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

const files = walk(SRC);

test('no aria-label is a hardcoded string literal', () => {
  const offenders = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      // aria-label="..." is always a literal. aria-label={t('key')} is not.
      const m = line.match(/aria-label="([^"]*[A-Za-z][^"]*)"/);
      if (m) offenders.push(`${file.replace(SRC, 'src/')}:${i + 1}  ${m[1]}`);
    });
  }
  expect(offenders, 'every aria-label should come from i18n').toEqual([]);
});

test('no aria-label is an untranslated template literal', () => {
  const offenders = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(/aria-label=\{`([^`]*[A-Za-z][^`]*)`\}/);
      if (m) offenders.push(`${file.replace(SRC, 'src/')}:${i + 1}  ${m[1]}`);
    });
  }
  expect(offenders, 'a template literal label is still untranslated').toEqual([]);
});

test('labelled controls announce in Arabic, not English', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify('ar'));
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  });
  await page.reload();

  // A spread of screens that between them carry most of the icon buttons.
  const screens = ['main', 'clients', 'schedule', 'profile', 'earnings', 'availability', 'clientHome'];
  const stillEnglish = [];

  for (const screen of screens) {
    await page.evaluate(async (s) => {
      const m = await import('/src/store/appStore.ts');
      m.useAppStore.getState().nav(s);
    }, screen);
    await page.waitForTimeout(350);

    const labels = await page.locator('[aria-label]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('aria-label') || ''),
    );
    for (const label of labels) {
      // A member's name or a task title may legitimately be Latin script —
      // those are user content interpolated into a translated label. What
      // must not appear is an English label with no Arabic in it at all.
      const hasArabic = /[؀-ۿ]/.test(label);
      const isLangToggle = label === 'EN' || label === 'ع';
      if (!hasArabic && !isLangToggle && /[A-Za-z]{4,}/.test(label)) {
        stillEnglish.push(`${screen}: ${label}`);
      }
    }
  }

  expect(stillEnglish, 'these controls announce in English on an Arabic screen').toEqual([]);
  await ctx.close();
});
