import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * `store/coach-invite.md` is the message and the setup guide Ahmed sends to
 * a launch coach, and it walks them through the real screens by quoting the
 * real labels — in two languages, neither of which the reader can check.
 *
 * A doc that quotes copy goes stale silently: someone renames a button,
 * every other test still passes, and the guide now tells ten coaches to tap
 * something that isn't there. So the guide ends in a table of every label it
 * quotes, keyed by its i18n key, and this reads that table back against
 * `translate()`.
 *
 * It is a source check, like release-config.spec.js, except that the
 * dictionary is TypeScript and `en`/`ar` are not exported — so the values
 * come from the one function the app itself renders through, inside the
 * page, rather than from a regex over i18n.ts.
 */

const doc = readFileSync(new URL('../store/coach-invite.md', import.meta.url), 'utf8');

/** The rows of the guide's closing table: | `key` | English | Arabic | */
function quotedLabels(markdown) {
  const heading = markdown.indexOf('## The labels these guides quote');
  if (heading === -1) return [];
  return markdown
    .slice(heading)
    .split('\n')
    .map((line) => /^\|\s*`([a-zA-Z0-9]+)`\s*\|([^|]*)\|([^|]*)\|\s*$/.exec(line))
    .filter(Boolean)
    .map(([, key, en, ar]) => ({ key, en: en.trim(), ar: ar.trim() }));
}

const labels = quotedLabels(doc);

test('the guide quotes enough of the app to be worth checking', () => {
  // A table that silently emptied — a renamed heading, a reformatted row —
  // would turn every assertion below into a pass over nothing.
  expect(labels.length, 'rows parsed out of the label table').toBeGreaterThan(25);
});

test('every label the guide quotes is the app\'s own wording, in both languages', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');

  const actual = await page.evaluate(async (keys) => {
    const m = await import('/src/lib/i18n.ts');
    return keys.map((key) => ({ key, en: m.translate('en', key), ar: m.translate('ar', key) }));
  }, labels.map((l) => l.key));

  const wrong = [];
  for (const [i, want] of labels.entries()) {
    const got = actual[i];
    if (got.en !== want.en) wrong.push(`${want.key} (en): guide says "${want.en}", app says "${got.en}"`);
    if (got.ar !== want.ar) wrong.push(`${want.key} (ar): guide says "${want.ar}", app says "${got.ar}"`);
  }
  expect(wrong, 'store/coach-invite.md quotes labels the app no longer uses').toEqual([]);

  await ctx.close();
});

/**
 * The table is what the test above checks, so a label can still drift in the
 * prose while the table stays right — which is exactly what happened on this
 * file's first run, and a substring check missed it because the label was
 * wrapped across two lines. Hence the flattening: the guides are read as one
 * line each, with markdown emphasis and the Arabic quotation marks removed.
 */
const flat = doc
  // Everything above the table. Flattening the whole file would have made
  // this vacuous: each label appears in its own table row, so the check
  // would pass on a doc whose prose quoted something else entirely.
  .slice(0, doc.indexOf('## The labels these guides quote'))
  .replace(/[*>«»]/g, '')
  .replace(/\s+/g, ' ');

test('the prose quotes the same labels as the table', () => {
  const missing = [];
  for (const { key, en, ar } of labels) {
    if (!flat.includes(en)) missing.push(`${key} (en): "${en}" is in the table but not in either guide`);
    if (!flat.includes(ar)) missing.push(`${key} (ar): "${ar}" is in the table but not in either guide`);
  }
  expect(missing, 'a label checked in the table but quoted differently in the guide').toEqual([]);
});

test('the guide claims nothing the app cannot do', () => {
  // The three §"may not claim" rules, as assertions. Each of these phrasings
  // was in an earlier draft of some Rafiq copy and had to be taken out.
  expect(doc, 'no promise of a phone notification').not.toMatch(/notif\w* on (your|their) phone|push notification will/i);
  expect(doc, 'no promise that members pay in the app').not.toMatch(/pay (in|inside|through) the app\b(?![^.]*\bdoesn)/i);
  expect(doc, 'no profile link to share: ShareProfile is hidden').not.toMatch(/rafiq\.app\/pro\/|share your (profile )?link/i);

  // Video is deployed by Ahmed, not by a merge, so the guide may describe it
  // only as the conditional bullet §"may not claim" item 4 spells out.
  const videoMentions = doc.match(/video call/gi) ?? [];
  expect(videoMentions.length, 'video appears only in the bracketed, conditional bullet').toBeLessThanOrEqual(1);
});

test('every blank left for Ahmed is listed as an open question', () => {
  const blanks = (doc.match(/⬚/g) ?? []).length;
  const questions = doc.slice(doc.indexOf('## Open questions for Ahmed'));
  // Six marks: three questions, each appearing in both languages' drafts
  // (the English and Arabic email signatures, the two guides' verification
  // lines and last lines) — the table says three, and the count has to be
  // reconcilable rather than drifting.
  expect(blanks, 'a blank nobody wrote a question for is a blank that ships').toBeGreaterThan(0);
  expect(questions).toMatch(/\|\s*1\s*\|/);
  expect(questions).toMatch(/\|\s*2\s*\|/);
  expect(questions).toMatch(/\|\s*3\s*\|/);
});
