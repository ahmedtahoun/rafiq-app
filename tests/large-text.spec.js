import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, setTextScale } from './helpers.js';

/**
 * Nothing runs off the side of the screen at the largest system text size.
 *
 * Android scales WebView text with the system font setting and every font
 * size in this app is in px, so a 200% setting doubles the text inside
 * boxes that stay the same width. `.phone-frame` clips
 * (`overflow: hidden`), so what breaks is silent: a chip, a button label or
 * a member's name is simply not there any more. That is how the three
 * Profile actions lost "Edit", the seven-day strip lost Sunday, and every
 * specialty chip lost its second half.
 *
 * What counts as a failure here is text whose box reaches past the frame.
 * Two things deliberately do not:
 *  - text its own box truncates with an ellipsis, which is a designed
 *    shortening, not a clipped screen;
 *  - text inside a rail that scrolls sideways on purpose (Discover's
 *    category filters), where reaching past the edge is the point.
 */

const SCREENS = [
  'accountDetails', 'addClient', 'addTask', 'addTimeBlock', 'auth', 'availability', 'claimInvite',
  'clientAuth', 'clientBooking', 'clientCoach', 'clientDetail', 'clientHelpCenter', 'clientHome',
  'clientNotifications', 'clientOnboarding', 'clientPrivacyPolicy', 'clientProfile', 'clientSchedule',
  'clientTasks', 'clientTermsOfService', 'clients', 'coachMessages', 'coachPreview', 'coachPrivacyPolicy',
  'coachTermsOfService', 'discover', 'earnings', 'editClient', 'editClientProfile', 'editProfile',
  'helpCenter', 'main', 'messages', 'messagesInbox', 'myCoaches', 'myPrograms', 'notifications',
  'offeringDetail', 'offerings', 'onboarding', 'payoutAccount', 'previewProfile', 'profile',
  'programDetail', 'rateCoach', 'roleSelect', 'schedule', 'sessionRoom', 'shareProfile',
  'subscription', 'templateDetail', 'templates', 'welcome',
];

/** Runs in the page: every screen, scaled, reporting what hangs off the edge. */
async function clippedText(page, screens, factor) {
  return page.evaluate(async ([list, f]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    const found = {};
    for (const screen of list) {
      useAppStore.getState().nav({ screen, params: { clientId: 'sara', coachId: 'c1' } });
      await new Promise((r) => setTimeout(r, 200));
      // Read every element's size before scaling any of them: scaling a
      // parent first made a child that inherits its size (a <bdi>, a <b>)
      // read the already-doubled size and double again, 4x instead of 2x.
      const els = [...document.querySelectorAll('.phone-frame, .phone-frame *')];
      for (const el of els) el.dataset.baseFontSize ??= getComputedStyle(el).fontSize;
      for (const el of els) el.style.fontSize = `${parseFloat(el.dataset.baseFontSize) * f}px`;
      await new Promise((r) => setTimeout(r, 130));

      const frame = document.querySelector('.phone-frame');
      if (!frame) continue;
      const fb = frame.getBoundingClientRect();
      const hits = [];
      for (const el of frame.querySelectorAll('*')) {
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!ownText) continue;

        let a = el;
        let excused = false;
        while (a && a !== frame) {
          const cs = getComputedStyle(a);
          if (cs.textOverflow === 'ellipsis') { excused = true; break; }
          const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
          const rail = cs.display.includes('flex') && cs.flexDirection === 'row' && cs.flexWrap === 'nowrap';
          if (a !== el && scrolls && rail && a.scrollWidth > a.clientWidth + 1) { excused = true; break; }
          a = a.parentElement;
        }
        if (excused) continue;

        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const spill = Math.round(Math.max(fb.left - r.left, r.right - fb.right));
        if (spill > 1) hits.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 24)}" +${spill}px`);
      }
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 1) hits.push(`the page scrolls sideways by ${doc.scrollWidth - doc.clientWidth}px`);
      if (hits.length) found[screen] = [...new Set(hits)].slice(0, 5);
    }
    return found;
  }, [screens, factor]);
}

async function phone(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
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
  return { ctx, page, errs };
}

for (const lang of ['en', 'ar']) {
  test(`no screen is clipped at 200% text (${lang})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page, errs } = await phone(browser, lang);
    expect(await clippedText(page, SCREENS, 2), 'text clipped by the edge of the screen').toEqual({});
    expect(errs).toEqual([]);
    await ctx.close();
  });

  test(`no screen is clipped at 130% text (${lang})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page, errs } = await phone(browser, lang);
    expect(await clippedText(page, SCREENS, 1.3), 'text clipped by the edge of the screen').toEqual({});
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

/**
 * The chips are the case that broke at every size, so they get a direct
 * check: a specialty chip has to wrap, not run past the edge of the card.
 */
test('a long specialty chip wraps rather than overflowing', async ({ browser }) => {
  const { ctx, page, errs } = await phone(browser, 'en');
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav({ screen: 'editProfile' });
  });
  await page.waitForTimeout(300);
  await setTextScale(page, 2);
  await page.waitForTimeout(200);

  const widest = await page.evaluate(() => {
    const frame = document.querySelector('.phone-frame').getBoundingClientRect();
    let worst = 0;
    for (const chip of document.querySelectorAll('.edit-profile-chip')) {
      const r = chip.getBoundingClientRect();
      worst = Math.max(worst, r.right - frame.right, frame.left - r.left);
    }
    return Math.round(worst);
  });

  expect(widest, 'a chip hanging off the side of the screen').toBeLessThanOrEqual(1);
  expect(errs).toEqual([]);
  await ctx.close();
});
