import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Money and dates must follow the language the user picked.
 *
 * They did not. Earnings and Main called `toLocaleString()` with no
 * argument — which formats in the *browser's* locale, not the app's — and
 * appended a hardcoded Latin "EGP" on an otherwise Arabic screen, while
 * six other screens got the currency right with their own ternary. Dates
 * were pinned to en-US everywhere, including screens rendered in Arabic.
 *
 * Numbers stay Western in both languages on purpose: every other number in
 * this app is (percentages, clock times, Discover's prices), so
 * Arabic-Indic digits here would be the odd one out. What must change with
 * the language is the currency word and the month name.
 */

async function open(browser, { screen, lang = 'en', seed = null, params = null, role = 'coach' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, r]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_role', JSON.stringify(r));
  }, [lang, role]);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

const frame = (page) => page.locator('.phone-frame').innerText();
const PAID = `(m) => m.addPayment('sara', { id: 'p1', amount: 5400, method: 'Cash', date: 'Oct 1, 2025' })`;

// ---------------------------------------------------------------------------

test('Earnings: the currency word follows the language', async ({ browser }) => {
  const en = await open(browser, { screen: 'earnings', seed: PAID });
  const enText = await frame(en.page);
  expect.soft(enText, 'English shows EGP').toContain('EGP');
  expect.soft(enText, 'and the grouped amount').toContain('5,400');
  expect.soft(/جنيه/.test(enText), 'no Arabic currency on the English screen').toBe(false);
  await en.ctx.close();

  const ar = await open(browser, { screen: 'earnings', lang: 'ar', seed: PAID });
  const arText = await frame(ar.page);
  // This is the bug: the Arabic screen used to read "5,400 EGP".
  expect.soft(arText, 'Arabic shows the Arabic currency word').toContain('جنيه');
  expect.soft(/\bEGP\b/.test(arText), 'and never the Latin one').toBe(false);
  expect.soft(arText, 'digits stay Western, like the rest of the app').toContain('5,400');
  expect.soft(ar.errs, 'no page errors').toEqual([]);
  await ar.ctx.close();
});

test('Main: the earnings card follows the language too', async ({ browser }) => {
  const ar = await open(browser, { screen: 'main', lang: 'ar', seed: PAID });
  const text = await frame(ar.page);
  expect.soft(/\bEGP\b/.test(text), 'no Latin currency on the Arabic home screen').toBe(false);
  expect.soft(text, 'the Arabic word instead').toContain('جنيه');
  await ar.ctx.close();
});

test('amounts group by the app locale, not the browser locale', async ({ browser }) => {
  // A browser set to a locale that groups differently must not change what
  // an English or Arabic screen renders.
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify('en'));
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  });
  await page.reload();
  await page.evaluate(async (src) => {
    const m = await import('/src/lib/mockStore.ts');
    await eval(src)(m);
  }, PAID);
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('earnings');
  });
  await page.waitForTimeout(450);

  const text = await page.locator('.phone-frame').innerText();
  // de-DE would render this as "5.400".
  expect.soft(text, 'grouped the English way regardless of the browser').toContain('5,400');
  expect.soft(/5\.400/.test(text), 'not the browser locale').toBe(false);

  await ctx.close();
});

test('dates the app formats follow the language', async ({ browser }) => {
  // The package expiry is computed from a timestamp and formatted on
  // render, so it is one the app controls end to end.
  const en = await open(browser, { screen: 'clientDetail', params: { clientId: 'sara' } });
  const enExpiry = await en.page.locator('.client-detail-pkg-expiry').innerText();
  expect.soft(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(enExpiry),
    'English month name in English').toBe(true);
  await en.ctx.close();

  const ar = await open(browser, { screen: 'clientDetail', lang: 'ar', params: { clientId: 'sara' } });
  const arExpiry = await ar.page.locator('.client-detail-pkg-expiry').innerText();
  // This used to read "Nov 21, 2025" in the middle of an Arabic sentence.
  expect.soft(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(arExpiry),
    'no English month name in Arabic').toBe(false);
  expect.soft(/يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر/.test(arExpiry),
    'an Arabic month name instead').toBe(true);
  expect.soft(ar.errs, 'no page errors').toEqual([]);
  await ar.ctx.close();
});

test('member session dates follow the language', async ({ browser }) => {
  // These come from getMemberSessions, which used to hand the screen an
  // already-formatted English string it could not localise.
  const ar = await open(browser, {
    screen: 'clientSchedule', lang: 'ar', role: 'client',
  });
  const dates = await ar.page.locator('.client-schedule-history-date').allInnerTexts();
  expect.soft(dates.length > 0, 'there is history to check').toBe(true);
  for (const d of dates) {
    expect.soft(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(d),
      `"${d}" has no English month name`).toBe(false);
  }
  await ar.ctx.close();
});

test('a stored payment date stays language-independent', async ({ browser }) => {
  // Recording a payment while the UI is in Arabic must not burn an Arabic
  // date into the ledger — it would then show in Arabic to an English user
  // forever. The ledger keeps the stable form; screens localise on render.
  const { page, ctx } = await open(browser, { screen: 'earnings', lang: 'ar' });

  const stored = await page.evaluate(async () => {
    const m = await import('/src/lib/mockStore.ts');
    m.addPayment('sara', { id: 'x1', amount: 100, method: 'Cash', date: m.formatDate(Date.now()) });
    m.refundPayment('sara', 'x1', 40, 'test');
    return m.getPaymentHistory('sara').map((p) => p.date);
  });

  for (const d of stored) {
    expect.soft(/[؀-ۿ]/.test(d), `stored date "${d}" has no Arabic in it`).toBe(false);
  }

  await ctx.close();
});

test('every screen that shows money agrees on the currency word', async ({ browser }) => {
  // Six screens each had their own copy of the ternary before this; the
  // point of one shared key is that they cannot disagree again.
  const screens = [
    ['offerings', 'coach'],
    ['earnings', 'coach'],
    ['subscription', 'coach'],
    ['discover', 'client'],
    ['clientCoach', 'client'],
  ];
  for (const [screen, role] of screens) {
    const { page, ctx } = await open(browser, { screen, lang: 'ar', role, seed: PAID });
    const text = await frame(page);
    if (/جنيه|EGP/.test(text)) {
      expect.soft(/\bEGP\b/.test(text), `${screen}: shows the Arabic currency word, not EGP`).toBe(false);
    }
    await ctx.close();
  }
});

test('every amount over 999 is grouped, in both languages', async ({ browser }) => {
  // Offerings, Discover, CoachPreview, PreviewProfile, ClientCoach,
  // ClientBooking, ClientDetail and both notification feeds each glued
  // `${price} ${currency}` together themselves, so an offering read
  // "5400 EGP" while Earnings said "5,400 EGP".
  // The last column is a control to tap first, for amounts shown in a sheet.
  const screens = [
    ['offerings', 'coach', null, '5,400', null],
    ['previewProfile', 'coach', null, '5,400', null],
    ['clientDetail', 'coach', { clientId: 'sara' }, '5,400', '.client-detail-view-history'],
    ['notifications', 'coach', null, '5,400', null],
    ['clientCoach', 'client', null, '7,200', '.client-coach-upgrade'],
  ];
  for (const lang of ['en', 'ar']) {
    for (const [screen, role, params, grouped, reveal] of screens) {
      const { page, ctx, errs } = await open(browser, { screen, lang, role, params, seed: PAID });
      if (reveal) {
        await page.locator(reveal).click();
        await page.waitForTimeout(400);
      }
      const text = await frame(page);
      expect.soft(text, `${screen} (${lang}) shows ${grouped}`).toContain(grouped);
      expect.soft(text.match(/\d{4,}\s*(EGP|جنيه)/)?.[0] ?? null, `${screen} (${lang}) has no ungrouped amount`).toBe(null);
      expect.soft(errs, `${screen} (${lang}) no page errors`).toEqual([]);
      await ctx.close();
    }
  }
});
