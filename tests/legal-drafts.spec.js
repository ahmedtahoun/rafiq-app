import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * `store/LEGAL-DRAFTS.md` is fifteen clauses counsel will mark up, and its
 * value is that every factual claim in it is true of the app today. Two of
 * those claims can rot silently, so they are checked here:
 *
 * - It quotes the **current** wording of four i18n keys, under "Current
 *   `key`:", to show what each clause replaces. Edit one of those keys and
 *   the file quietly starts telling a lawyer the app says something it no
 *   longer says — and a lawyer bills for reviewing it.
 * - Every `[PLACEHOLDER]` is a fact Ahmed has to supply, and the table at
 *   the top is the list he works from. A placeholder in a clause but not in
 *   the table is a fact nobody has been asked for. A row whose answer is in
 *   may outlive its placeholder; an unanswered row no clause uses may not.
 *
 * Nothing here checks the drafts themselves. They are prose for a lawyer,
 * not behaviour.
 */

const doc = readFileSync(new URL('../store/LEGAL-DRAFTS.md', import.meta.url), 'utf8');

/** `> *Current `key`:* "…"`, with the blockquote prefixes and the markdown
    emphasis the file adds for readability taken back out. */
function quotedCurrentText(markdown) {
  const out = [];
  const re = /> \*Current `([A-Za-z0-9]+)`:\* "((?:[^"]|\n)*?)"/g;
  for (const m of markdown.matchAll(re)) {
    const text = m[2]
      .split('\n')
      .map((line) => line.replace(/^> ?/, ''))
      .join(' ')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ key: m[1], text });
  }
  return out;
}

const quotes = quotedCurrentText(doc);

test('the file quotes the app, and the quotes are worth checking', () => {
  // A reformat that broke the pattern would turn the next test into a pass
  // over an empty list.
  expect(quotes.length, 'current-wording quotes parsed out of the file').toBeGreaterThanOrEqual(4);
});

test('every "current wording" it shows counsel is the app\'s wording today', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');

  const actual = await page.evaluate(async (keys) => {
    const m = await import('/src/lib/i18n.ts');
    return keys.map((k) => m.translate('en', k));
  }, quotes.map((q) => q.key));

  const wrong = [];
  for (const [i, q] of quotes.entries()) {
    // The app's own curly apostrophes vs the file's straight ones are a
    // rendering difference, not a drift in meaning.
    const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    if (norm(actual[i]) !== norm(q.text)) {
      wrong.push(`${q.key}:\n  file: ${q.text}\n  app:  ${actual[i]}`);
    }
  }
  expect(wrong, 'store/LEGAL-DRAFTS.md quotes wording the app has changed').toEqual([]);

  await ctx.close();
});

test('every placeholder in a clause is a fact the table asks Ahmed for', () => {
  const tableEnd = doc.indexOf('## Where each clause goes');
  expect(tableEnd, 'the open-facts table is still above the clause index').toBeGreaterThan(0);
  const table = doc.slice(0, tableEnd);
  const clauses = doc.slice(doc.indexOf('## 1 · Parties'));

  const placeholders = (text) => text.match(/\[[A-Z][A-Za-z0-9 .]*\]/g) ?? [];
  const used = new Set(placeholders(clauses));
  const listed = new Set(placeholders(table));
  // A row whose answer is in — "**Given", "**Decided", "**Answered" or
  // "**Proposed" from the law — stays in the table as the record of who
  // decided it, while the clauses carry the fact itself. Only a row still
  // waiting for an answer has to have a clause that uses it.
  const answered = new Set(
    table
      .split('\n')
      .filter((row) => /^\|[^|]*\|\s*\*\*(Given|Decided|Answered|Proposed)\b/.test(row))
      .flatMap((row) => placeholders(row.split('|')[1])),
  );

  const unasked = [...used].filter((p) => !listed.has(p));
  const unused = [...listed].filter((p) => !used.has(p) && !answered.has(p));
  expect(unasked, 'used in a clause but not in the open-facts table').toEqual([]);
  expect(unused, 'in the table but no clause uses it').toEqual([]);
});

test('no clause went out unmarked, and nothing went live', () => {
  const headings = doc.match(/^## \d+ · /gm) ?? [];
  expect(headings.length, 'fifteen numbered clauses').toBe(15);
  // Each one has to carry its standing — Proposed, or Approved by counsel
  // with the date — because that is the whole standing of this file.
  const marked = doc.match(/^## \d+ · .*\*\*(Proposed|Approved by counsel, \d{4}-\d{2}-\d{2})\*\*/gm) ?? [];
  expect(marked.length, 'every clause heading says Proposed or Approved by counsel').toBe(15);
});
