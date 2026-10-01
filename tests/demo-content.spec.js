import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The invented coaches do not reach the app Ahmed ships (LAUNCH-CHECKLIST §2).
 *
 * Discover's signed-out demo lists eight coaches who are not people, with
 * invented ratings, prices and years, and two members who review them in
 * words nobody said. Signed in, that path has read the real
 * `coach_directory` view since migration step 4 — but a reviewer, or
 * anyone who downloads the app, meets the invented ones first, and
 * placeholder content in a marketplace is both a rejection reason and a
 * lie to the person reading it.
 *
 * `DEMO_DIRECTORY` in `src/lib/directory.ts` is the gate: false in a
 * `vite build`, so the seed is empty in the bundle `npx cap sync` copies
 * into the native apps, and still there in dev and in this suite.
 *
 * This file checks both halves, because each on its own would pass while
 * the app was wrong:
 *
 *   1. the production build carries none of the invented names, and
 *   2. the demo they came from still works in development.
 *
 * What the first test cannot show is the rendered screen: the suite talks
 * to the dev server so it can import the app's modules, and a production
 * build has no module graph to reach into. The rendered half is already
 * covered — an empty directory shows "No pros yet"
 * (`tests/accept-flow.spec.js`, signed in against an empty
 * `coach_directory`), and that is the same `coaches.length === 0` branch
 * an empty seed takes.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The text of a `const NAME = ... [ ... ];` literal, braces and all. */
function literal(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) return '';
  const end = source.indexOf('\n];', start) >= 0 ? source.indexOf('\n];', start) : source.indexOf('\n};', start);
  return end < 0 ? '' : source.slice(start, end);
}

const all = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

/**
 * Names that are in the bundle for a reason unrelated to this gate, so
 * finding one proves nothing about the demo directory. Each is checked
 * below to still be where it is claimed to be — an exclusion that has
 * quietly stopped being true is how a test like this goes vacuous.
 */
const ALSO_ELSEWHERE = {
  'Dina Kamal': ['src/lib/i18n.ts'], // the AddClient name placeholder, "e.g. ..."
  // DEFAULT_CLIENTS — the Pro's own demo roster, a separate §2 item that
  // is still open, and a separate data layer (mockStore) that Reem is
  // migrating. Out of this change's reach; see the PR.
  'Nour Hassan': ['src/lib/mockStore.ts'],
  'Omar Fathy': ['src/lib/mockStore.ts', 'src/screens/Schedule.tsx'],
};

test('no invented coach or review reaches the production bundle', () => {
  test.setTimeout(180_000);

  const directory = read('src/lib/directory.ts');
  const discover = read('src/screens/Discover.tsx');

  // Read the cast from the source rather than listing it here, so a ninth
  // demo coach or a third story is covered the day it is added.
  const coaches = all(literal(directory, 'export const DIRECTORY_COACHES'), /\bname: '([^']+)'/g);
  const storyBlock = literal(discover, 'const STORY_KEYS');
  const reviewers = all(storyBlock, /\breviewer(?:Ar)?: '([^']+)'/g);
  const quotes = all(literal(discover, 'const STORY_QUOTES'), /\b(?:en|ar): '([^']+)'/g);

  // If the extraction ever stops matching, every assertion below passes
  // over an empty list. Fail loudly instead.
  expect(coaches.length, 'demo coach names found in directory.ts').toBeGreaterThanOrEqual(8);
  expect(reviewers.length, 'story reviewer names found in Discover.tsx').toBeGreaterThanOrEqual(4);
  expect(quotes.length, 'story quotes found in Discover.tsx').toBeGreaterThanOrEqual(4);

  for (const [name, files] of Object.entries(ALSO_ELSEWHERE)) {
    expect(
      files.some((f) => read(f).includes(name)),
      `"${name}" is excused because of ${files.join(' / ')}; it is no longer there, so drop it from ALSO_ELSEWHERE`,
    ).toBe(true);
  }

  const invented = [...coaches, ...reviewers, ...quotes].filter((s) => !(s in ALSO_ELSEWHERE));
  expect(invented.length, 'invented strings that nothing else in the app uses').toBeGreaterThanOrEqual(10);

  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', timeout: 150_000 });

  const assets = join(ROOT, 'dist', 'assets');
  const bundles = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, text: readFileSync(join(assets, f), 'utf8') }));
  expect(bundles.length, 'built JavaScript in dist/assets').toBeGreaterThan(0);

  const shipped = invented
    .map((s) => ({ s, where: bundles.filter((b) => b.text.includes(s)).map((b) => b.file) }))
    .filter((hit) => hit.where.length > 0)
    .map((hit) => `${hit.s}  →  ${hit.where.join(', ')}`);

  expect(shipped, 'invented people and words found in the shipped bundle').toEqual([]);
});

test('the demo directory is still there in development', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
  });
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('discover');
  });

  // The gate is a build-time constant, so the only way to be sure it did
  // not also empty the demo is to look at the demo.
  const seeded = await page.evaluate(async () => {
    const d = await import('/src/lib/directory.ts');
    return { on: d.DEMO_DIRECTORY, coaches: d.getDirectoryCoaches().length, trending: d.getTrendingCoaches().length };
  });
  expect(seeded).toEqual({ on: true, coaches: 8, trending: 3 });

  await expect(page.locator('.discover-no-coaches-title')).toHaveCount(0);
  expect(await page.locator('.discover-card-main').count(), 'coach cards').toBe(8);
  expect(await page.locator('.discover-story').count(), 'sample stories').toBe(2);

  expect(errs).toEqual([]);
  await ctx.close();
});
