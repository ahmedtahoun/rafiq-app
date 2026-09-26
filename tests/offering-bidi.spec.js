import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Offering names and durations are written by the Pro, usually in English,
 * and shown on Arabic screens. Without isolation the bidi algorithm moves a
 * leading digit to the far end: "8-Week Transformation Program" read
 * "Week Transformation-8 Program", "1:1 Coaching Session" read "Coaching
 * Session 1:1", and "50 min" read "min 50".
 *
 * These assert on where the glyphs actually land, not on markup: in an
 * English phrase the digit has to sit to the left of the word after it.
 */

async function open(browser, { screen, role = 'coach', seed = null }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify('ar'));
    localStorage.setItem('rafiq_role', JSON.stringify(r));
  }, role);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(900); // past the cards' entry animation
  return { page, ctx, errs };
}

/**
 * For each visible occurrence of `phrase`, whether its first character is
 * drawn to the left of its last — true for LTR text rendered in order.
 */
function readsLeftToRight(page, phrase) {
  return page.evaluate((p) => {
    const results = [];
    const walker = document.createTreeWalker(document.querySelector('.phone-frame'), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(p);
      if (at < 0) continue;
      const box = (i) => {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        return r.getBoundingClientRect();
      };
      const first = box(at);
      const last = box(at + p.length - 1);
      if (!first.width) continue;
      // Same line only — a wrapped phrase says nothing about order.
      if (Math.abs(first.top - last.top) > 4) continue;
      results.push(first.left < last.left);
    }
    return results;
  }, phrase);
}

test('Offerings (Arabic): names and durations keep their order', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'offerings' });
  for (const phrase of ['8-Week', '1:1 Coaching', '50 min']) {
    const seen = await readsLeftToRight(page, phrase);
    expect(seen.length, `"${phrase}" is on screen`).toBeGreaterThan(0);
    expect(seen.every(Boolean), `"${phrase}" reads left to right`).toBe(true);
  }
  expect(errs).toEqual([]);
  await ctx.close();
});

test('member-facing profile preview (Arabic): same', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'previewProfile' });
  for (const phrase of ['8-Week', '1:1 Coaching', '50 min']) {
    const seen = await readsLeftToRight(page, phrase);
    expect(seen.length, `"${phrase}" is on screen`).toBeGreaterThan(0);
    expect(seen.every(Boolean), `"${phrase}" reads left to right`).toBe(true);
  }
  expect(errs).toEqual([]);
  await ctx.close();
});

test('an offering name inside a translated sentence keeps its order', async ({ browser }) => {
  // "الحجز: {name}" — the name goes through t(), where no <bdi> can be
  // wrapped around it, so it relies on isolate().
  const seed = `(m) => m.setSelectedOfferingId(m.getOfferings().find((o) => o.name.startsWith('8-Week')).id)`;
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking', role: 'client', seed });
  const seen = await readsLeftToRight(page, '8-Week');
  expect(seen.length, 'the booking line names the offering').toBeGreaterThan(0);
  expect(seen.every(Boolean), '"8-Week" reads left to right').toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});
