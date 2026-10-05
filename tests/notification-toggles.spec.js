import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The notification toggles on both profile screens.
 *
 * In a browser there are no phone notifications (a phone has them since
 * the push PRs — tests/push-app.spec.js), so a switch labelled "Session
 * reminders" promised something that never arrives. Worse, the coach's three switches were
 * pure local component state: nothing persisted them and nothing read
 * them, so they reset on navigation and changed nothing at all.
 *
 * These assert both halves: the screens say the feed is in-app only, and
 * the switches actually move what the feed contains.
 */

async function open(browser, { screen, role, lang = 'en', seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, [role, lang]);
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
  await page.waitForTimeout(600);
  return { page, ctx, errs };
}

const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);

test("the coach's notification switches persist and really filter the feed", async ({ browser }) => {
  // The demo seed carries no payments, so getProNotifications produces no
  // payment-received row until one exists. Seed one rather than assert on
  // a feed that happens to be empty — a filter that removes nothing would
  // pass that.
  const { page, ctx, errs } = await open(browser, {
    screen: 'profile',
    role: 'coach',
    seed: "(m) => m.addPayment('sara', { id: 'paytest1', amount: 750, method: 'Cash', status: 'paid', date: m.formatDate(Date.now()) })",
  });

  const scope = await page.locator('.profile-notif-scope').innerText();
  expect.soft(/in-app/i.test(scope), 'says the feed is in-app').toBe(true);
  expect.soft(/phone/i.test(scope), '  and promises nothing on the phone, in a browser').toBe(false);

  // Requests and payments are the only two kinds getProNotifications
  // produces, so there are exactly two switches under the master.
  expect.soft(String(await page.locator('.profile-notif-sub-row').count()), 'two categories').toBe('2');
  const labels = (await page.locator('.profile-notif-sub-label').allInnerTexts()).join('|');
  expect.soft(/check-?in/i.test(labels), 'no switch for a check-in notification that does not exist').toBe(false);
  expect.soft(/reminder/i.test(labels), 'no category calls itself a reminder').toBe(false);

  const before = await store(page, '(m)=>m.getProNotifications().map(n=>n.kind)');
  expect.soft(String(before.includes('payment-received')), 'payments are in the feed to begin with').toBe('true');

  // Turn payments off: this has to persist AND change the feed.
  const payRow = page.locator('.profile-notif-sub-row').filter({ hasText: /Payment/i });
  await payRow.locator('.profile-switch').click();
  await page.waitForTimeout(300);
  expect.soft(String(await store(page, '(m)=>m.getProNotificationPrefs().payments')), 'preference persisted').toBe('false');
  const after = await store(page, '(m)=>m.getProNotifications().map(n=>n.kind)');
  expect.soft(String(after.includes('payment-received')), 'payments gone from the feed').toBe('false');
  expect.soft(String(after.length < before.length), '  and the feed actually shrank').toBe('true');

  // It survives leaving the screen, which the old local state did not.
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('main');
    m.useAppStore.getState().nav('profile');
  });
  await page.waitForTimeout(500);
  const stillOff = await payRow.locator('.profile-switch').getAttribute('class');
  expect.soft(String(stillOff.includes('is-on')), 'still off after navigating away and back').toBe('false');

  // The master switch empties the feed.
  await page.locator('.profile-notif-main .profile-switch').click();
  await page.waitForTimeout(300);
  expect.soft(String((await store(page, '(m)=>m.getProNotifications()')).length), 'master off empties the feed').toBe('0');

  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test("the member's notification card says the feed is in-app only", async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', role: 'client' });

  const scope = await page.locator('.client-profile-notif-scope').innerText();
  expect.soft(/in-app/i.test(scope), 'says the feed is in-app').toBe(true);
  expect.soft(/phone/i.test(scope), '  and promises nothing on the phone, in a browser').toBe(false);

  const labels = (await page.locator('.client-profile-notif-sub-label').allInnerTexts()).join('|');
  expect.soft(/reminder/i.test(labels), 'no category calls itself a reminder').toBe(false);

  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('both notification cards render in Arabic without raw keys', async ({ browser }) => {
  for (const [screen, role, cls] of [
    ['profile', 'coach', '.profile-notif-scope'],
    ['clientProfile', 'client', '.client-profile-notif-scope'],
  ]) {
    const { page, ctx, errs } = await open(browser, { screen, role, lang: 'ar' });
    const scope = await page.locator(cls).innerText();
    expect.soft(/[؀-ۿ]/.test(scope), `${screen} scope note is Arabic`).toBe(true);
    expect.soft(/notif|push|reminder/i.test(scope), `  ${screen} has no English left in it`).toBe(false);
    expect.soft(String(errs.length), `  ${screen} no errors`).toBe('0');
    await ctx.close();
  }
});

/**
 * No screen may claim a notification the app does not send. `cancelBooking`
 * writes a cancellation, removes the block and clears nextSessionAtMs —
 * the other side sees their schedule change, but nothing notifies them.
 */
test('no copy claims a notification the app never sends', async () => {
  const { readFileSync } = await import('node:fs');
  const dict = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8');

  const banned = [
    [/will be notified/i, 'an English "will be notified" promise'],
    [/سيتم إشعار/, 'an Arabic "will be notified" promise'],
  ];
  for (const [re, what] of banned) {
    expect(dict, `i18n.ts still contains ${what}`).not.toMatch(re);
  }
});
