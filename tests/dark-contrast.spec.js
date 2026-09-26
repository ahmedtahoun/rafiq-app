import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * No text renders pure black in dark mode.
 *
 * The global button reset in tokens.css set no colour, so any <button>
 * without its own fell back to the browser default — black — and vanished
 * on the dark background: member names on Home, Members and Earnings,
 * every offering name and price, the dial-code pickers, the Support rows,
 * the member's agreement card. Fifteen screens, none of them a type error.
 */

const SCREENS = [
  'accountDetails', 'addClient', 'addTask', 'addTimeBlock', 'auth', 'availability', 'clientAuth',
  'clientBooking', 'clientCoach', 'clientDetail', 'clientHelpCenter', 'clientHome', 'clientNotifications',
  'clientOnboarding', 'clientPrivacyPolicy', 'clientProfile', 'clientSchedule', 'clientTasks',
  'clientTermsOfService', 'clients', 'coachMessages', 'coachPreview', 'coachPrivacyPolicy',
  'coachTermsOfService', 'discover', 'earnings', 'editClient', 'editClientProfile', 'editProfile',
  'helpCenter', 'main', 'messages', 'messagesInbox', 'myCoaches', 'myPrograms', 'notifications',
  'offeringDetail', 'offerings', 'onboarding', 'previewProfile', 'profile', 'programDetail', 'rateCoach',
  'roleSelect', 'schedule', 'sessionRoom', 'shareProfile', 'subscription', 'templateDetail', 'templates',
  'welcome',
];

// Apple's sign-in button is white with black text in dark mode by design.
const INTENTIONALLY_BLACK = '.auth-btn-apple, .client-auth-btn-apple';

test('no screen renders black text in dark mode', async ({ browser }) => {
  test.setTimeout(90_000);
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
    localStorage.setItem('rafiq_dark', JSON.stringify(true));
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  });
  await page.reload();

  const black = await page.evaluate(async ([screens, allowed]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    const found = {};
    for (const screen of screens) {
      useAppStore.getState().nav({ screen, params: { clientId: 'sara' } });
      await new Promise((r) => setTimeout(r, 300));
      const hits = [];
      for (const el of document.querySelectorAll('.phone-frame *')) {
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText || el.closest(allowed)) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (getComputedStyle(el).color === 'rgb(0, 0, 0)') hits.push(el.textContent.trim().slice(0, 40));
      }
      if (hits.length) found[screen] = hits;
    }
    return found;
  }, [SCREENS, INTENTIONALLY_BLACK]);

  expect(black, 'black text on the dark background').toEqual({});
  expect(errs).toEqual([]);
  await ctx.close();
});
