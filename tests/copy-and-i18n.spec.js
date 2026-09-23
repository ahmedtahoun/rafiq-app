import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Guards on copy that has to stay true to what the app does, and on the
 * i18n plumbing that renders it.
 *
 * The WhatsApp assertions are not style checks. The onboarding carousel
 * used to promise that everything happened "over WhatsApp, no new app for
 * them to learn" while the app shipped its own member experience with
 * in-app messaging, and the privacy policy said no third-party messaging
 * service is involved. These keep the three from drifting apart again.
 */

async function open(browser, { screen = 'welcome', lang = 'en', params = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
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
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
  }, lang);
  await page.reload();
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

const frame = (page) => page.locator('.phone-frame').innerText();

test('onboarding slide 2 describes in-app messaging, not WhatsApp (EN)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'welcome' });
  await page.locator('button').filter({ hasText: /^Next$/ }).first().click();
  await page.waitForTimeout(250);

  const text = (await frame(page)).replace(/\s+/g, ' ');
  expect.soft(/whatsapp/i.test(text), 'slide 2 does not name WhatsApp').toBe(false);
  expect.soft(text, 'slide 2 says messages stay in Rafiq').toContain('stays in Rafiq');
  // The eyebrow and the headline are different lines of copy; when the
  // headline changed they briefly said the same thing.
  expect.soft(/Stay close\s+Stay close/i.test(text), 'eyebrow is not echoed by the headline').toBe(false);
  expect.soft(errs, 'no page errors').toEqual([]);
  await ctx.close();
});

test('onboarding slide 2 describes in-app messaging, not WhatsApp (AR)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'welcome', lang: 'ar' });
  await page.locator('button').filter({ hasText: /^التالي$/ }).first().click();
  await page.waitForTimeout(250);

  const text = (await frame(page)).replace(/\s+/g, ' ');
  expect.soft(/واتساب/.test(text), 'slide 2 does not name WhatsApp').toBe(false);
  expect.soft(text, 'slide 2 says messages stay inside Rafiq').toContain('داخل رفيق');
  expect.soft(errs, 'no page errors').toEqual([]);
  await ctx.close();
});

test('help centre describes the member form that actually exists', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'helpCenter' });
  const text = await frame(page);

  expect.soft(text, 'the add-a-member answer is shown').toContain('Members tab');
  // The form labels this field "Phone number"; the answer used to call it
  // a WhatsApp number, naming a field the screen does not have.
  expect.soft(/WhatsApp number/i.test(text), 'no WhatsApp number field is claimed').toBe(false);
  expect.soft(text, 'it names the real field').toContain('phone number');
  await ctx.close();
});

test('both privacy policies say messaging is in-app', async ({ browser }) => {
  for (const screen of ['coachPrivacyPolicy', 'clientPrivacyPolicy']) {
    const { page, ctx } = await open(browser, { screen });
    const text = await frame(page);
    expect.soft(await page.locator('.policy-page-section').count(), `${screen}: six sections`).toBe(6);
    expect.soft(/whatsapp/i.test(text), `${screen}: names no third-party messenger`).toBe(false);
    expect.soft(text, `${screen}: states messages are covered by this policy`)
      .toContain('No third-party messaging service is involved');
    await ctx.close();
  }
});

test('policy pages render every section in both languages', async ({ browser }) => {
  for (const lang of ['en', 'ar']) {
    for (const screen of ['coachPrivacyPolicy', 'clientPrivacyPolicy', 'coachTermsOfService', 'clientTermsOfService']) {
      const { page, ctx, errs } = await open(browser, { screen, lang });
      expect.soft(await page.locator('.policy-page-section').count(), `${screen}/${lang}: six sections`).toBe(6);
      const text = await frame(page);
      // A key that is missing renders as its own name; this catches that.
      expect.soft(/privacySection|termsSection|clientPrivacySection|clientTermsSection/.test(text),
        `${screen}/${lang}: no raw i18n keys`).toBe(false);
      expect.soft(errs, `${screen}/${lang}: no page errors`).toEqual([]);
      await ctx.close();
    }
  }
});

test('day names resolve to real copy on every screen that shows them', async ({ browser }) => {
  const cases = [
    ['schedule', 'en', /MON|TUE|WED/],
    ['availability', 'en', /Monday|Wednesday/],
    ['clientBooking', 'en', /MON|TUE|WED/],
    ['availability', 'ar', /إثنين|ثلاثاء|أربعاء/],
    ['clientBooking', 'ar', /إثنين|ثلاثاء|أربعاء/],
  ];
  for (const [screen, lang, expected] of cases) {
    const { page, ctx, errs } = await open(browser, { screen, lang });
    const text = await frame(page);
    expect.soft(expected.test(text), `${screen}/${lang}: day names render`).toBe(true);
    // dayKey() builds these from an index; a wrong index would leave the
    // key itself on screen rather than a day name.
    expect.soft(/dowShort|dowFull/.test(text), `${screen}/${lang}: no raw day keys`).toBe(false);
    expect.soft(errs, `${screen}/${lang}: no page errors`).toEqual([]);
    await ctx.close();
  }

  // CoachPreview needs a pro to preview; without one it renders its empty
  // state and has no day strip at all.
  const { page, ctx } = await open(browser, { screen: 'coachPreview', params: { coachId: 'mariam' } });
  const text = await frame(page);
  expect.soft(/MON|TUE|WED/.test(text), 'coachPreview: day names render').toBe(true);
  expect.soft(/dowShort|dowFull/.test(text), 'coachPreview: no raw day keys').toBe(false);
  await ctx.close();
});
