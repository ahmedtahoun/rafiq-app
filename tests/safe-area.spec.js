import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, SAFE_TOP, SAFE_BOTTOM, installScreenSettle, simulateNotch } from './helpers.js';

/**
 * Nothing a user has to tap sits under the status bar or the home indicator.
 *
 * On the iPhone simulator the onboarding carousel's Skip and back buttons
 * were drawn inside the status bar, and iOS swallows taps there, so Skip
 * did nothing at all. They are `position: absolute; top: 26px` inside the
 * hero, which is why the fix is padding on `.phone-frame` — padding on the
 * header would not have moved them.
 *
 * 390x844 is an iPhone 14 Pro; `simulateNotch` stands in for its insets,
 * which a desktop browser reports as zero.
 */

const TOP_BUTTON_SCREENS = [
  'welcome', 'onboarding', 'clientOnboarding', 'roleSelect', 'main', 'clientHome',
  'schedule', 'clients', 'profile', 'clientProfile', 'messages', 'editProfile',
  'notifications', 'discover', 'clientDetail', 'claimInvite',
];

// Screens with the tab bar, which has to clear the home indicator.
const BOTTOM_NAV_SCREENS = ['main', 'clients', 'schedule', 'profile', 'clientHome', 'clientTasks'];

async function openPhone(browser, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await installScreenSettle(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  }, lang);
  await page.reload();
  await simulateNotch(page);
  return { ctx, page, errs };
}

test('no top button is under the status bar', async ({ browser }) => {
  test.setTimeout(60_000);
  const { ctx, page, errs } = await openPhone(browser);

  const offenders = await page.evaluate(async ([screens, inset]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    const found = {};
    for (const screen of screens) {
      useAppStore.getState().nav({ screen, params: { clientId: 'sara', coachId: 'c1' } });
      await window.__screenSettled();
      let highest = null;
      for (const el of document.querySelectorAll('.phone-frame button, .phone-frame a')) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (!highest || box.top < highest.top) highest = { top: box.top, label: (el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 30) };
      }
      // A screen with no button at all is not a failure, just nothing to check.
      if (highest && highest.top < inset) found[screen] = highest;
    }
    return found;
  }, [TOP_BUTTON_SCREENS, SAFE_TOP]);

  expect(offenders, 'tappable controls inside the status bar').toEqual({});
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the tab bar clears the home indicator', async ({ browser }) => {
  const { ctx, page, errs } = await openPhone(browser);

  const tooLow = await page.evaluate(async ([screens, inset]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    const found = {};
    for (const screen of screens) {
      useAppStore.getState().nav({ screen, params: { clientId: 'sara' } });
      await window.__screenSettled();
      const nav = document.querySelector('.bottom-nav');
      const frame = document.querySelector('.phone-frame');
      if (!nav || !frame) continue;
      const gap = frame.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom;
      if (gap < inset) found[screen] = Math.round(gap);
    }
    return found;
  }, [BOTTOM_NAV_SCREENS, SAFE_BOTTOM]);

  expect(tooLow, 'the tab bar overlapping the home indicator').toEqual({});
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the composer and the sheet clear the home indicator in Arabic too', async ({ browser }) => {
  const { ctx, page, errs } = await openPhone(browser, 'ar');

  const gaps = await page.evaluate(async ([inset]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    const out = {};
    for (const [screen, sel] of [['messages', '.messages-composer'], ['addTask', '.add-task-submit'], ['clientBooking', '.client-booking-bar button']]) {
      useAppStore.getState().nav({ screen, params: { clientId: 'sara' } });
      await window.__screenSettled();
      const el = document.querySelector(sel);
      const frame = document.querySelector('.phone-frame');
      if (!el || !frame) { out[screen] = 'missing'; continue; }
      // The bar's own background may reach the edge; its content must not.
      const inner = el.matches('button') ? el : el.querySelector('button, input') ?? el;
      const gap = frame.getBoundingClientRect().bottom - inner.getBoundingClientRect().bottom;
      if (gap < inset) out[screen] = Math.round(gap);
    }
    return out;
  }, [SAFE_BOTTOM]);

  expect(gaps, 'controls sitting on the home indicator').toEqual({});
  expect(errs).toEqual([]);
  await ctx.close();
});
