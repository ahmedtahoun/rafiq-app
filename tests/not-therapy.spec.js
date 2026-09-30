import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * "Coaching is not therapy", and where to get help instead.
 *
 * Three surfaces, because these are the three places a member can reach
 * without already being in a conversation: their own onboarding, the
 * member terms, and the coach terms (a coach needs to know where to send
 * someone).
 *
 * The strongest check here is the last one: **no crisis row may show a
 * number that is not in `crisisResources.ts`**. A wrong number on this
 * screen is worse than none — someone dials it at the worst moment of
 * their life. Every number starts null, and the row says so rather than
 * rendering a blank or a dead `tel:` link.
 */

async function open(browser, lang, screen) {
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
  }, lang);
  await page.reload();
  await page.evaluate(async (s) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav({ screen: s });
  }, screen);
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

for (const [screen, label] of [['clientTermsOfService', 'member'], ['coachTermsOfService', 'coach']]) {
  for (const lang of ['en', 'ar']) {
    test(`the ${label} terms say coaching is not therapy and list where to get help (${lang})`, async ({ browser }) => {
      const { ctx, page, errs } = await open(browser, lang, screen);

      const expected = await page.evaluate(async (l) => {
        const { translate } = await import('/src/lib/i18n.ts');
        return {
          title: translate(l, 'notTherapyTitle'),
          emergency: translate(l, 'crisisEmergencyLead'),
          firstRow: translate(l, 'crisisEmergencyName'),
        };
      }, lang);

      const body = await page.locator('.policy-page-body').innerText();
      expect(body).toContain(expected.title);
      expect(body).toContain(expected.emergency);
      expect(body).toContain(expected.firstRow);

      // Every resource gets a row, not just the ones that fit.
      const rows = await page.locator('.crisis-row').count();
      const defined = await page.evaluate(async () => {
        const { CRISIS_RESOURCES } = await import('/src/lib/crisisResources.ts');
        return CRISIS_RESOURCES.length;
      });
      expect(rows).toBe(defined);

      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('member onboarding says coaching is not therapy, and opens the crisis list', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 'en', 'clientOnboarding');

  await expect(page.locator('.client-onboarding-care-title')).toHaveText('Coaching is not therapy');
  // Not on screen until asked for: onboarding should not open with a
  // crisis list, only with a way to reach one.
  await expect(page.locator('.crisis-row')).toHaveCount(0);

  await page.locator('.client-onboarding-care-link').click();
  await expect(page.locator('.sheet-panel .crisis-row').first()).toBeVisible();

  expect(errs).toEqual([]);
  await ctx.close();
});

test('member onboarding reaches the crisis list in Arabic too', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 'ar', 'clientOnboarding');

  const expected = await page.evaluate(async () => {
    const { translate } = await import('/src/lib/i18n.ts');
    return { title: translate('ar', 'notTherapyTitle'), action: translate('ar', 'crisisOpenAction') };
  });
  await expect(page.locator('.client-onboarding-care-title')).toHaveText(expected.title);
  await page.locator('.client-onboarding-care-link').click();
  await expect(page.locator('.sheet-panel .crisis-row').first()).toBeVisible();
  expect(await page.locator('.client-onboarding-care-link').innerText()).toBe(expected.action);

  expect(errs).toEqual([]);
  await ctx.close();
});

/**
 * The one that matters most. A row renders a `tel:` link only for a number
 * the data actually carries; anything else has to be the "not confirmed
 * yet" marker, never a blank and never a guess.
 */
test('no crisis row shows a number the data does not have', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 'en', 'clientTermsOfService');

  const problems = await page.evaluate(async () => {
    const { CRISIS_RESOURCES } = await import('/src/lib/crisisResources.ts');
    const rows = [...document.querySelectorAll('.crisis-row')];
    const bad = [];
    rows.forEach((row, i) => {
      const resource = CRISIS_RESOURCES[i];
      const call = row.querySelector('.crisis-call');
      const unconfirmed = row.querySelector('.crisis-unconfirmed');
      if (resource.phone === null) {
        if (call) bad.push(`${resource.id}: renders a number the data does not have`);
        if (!unconfirmed || !unconfirmed.textContent.trim()) bad.push(`${resource.id}: unconfirmed row says nothing`);
      } else {
        if (!call) bad.push(`${resource.id}: has a number but does not offer it`);
        else if (!call.textContent.includes(resource.phone)) bad.push(`${resource.id}: shows a different number`);
        else if (!call.getAttribute('href').startsWith('tel:')) bad.push(`${resource.id}: not dialable`);
      }
    });
    return bad;
  });

  expect(problems, 'a crisis row that misleads').toEqual([]);

  // And nothing anywhere on the screen looks like a phone number unless a
  // resource carries it — the guard against a number reaching the copy.
  const strayNumbers = await page.evaluate(async () => {
    const { CRISIS_RESOURCES } = await import('/src/lib/crisisResources.ts');
    const known = CRISIS_RESOURCES.map((r) => r.phone).filter(Boolean);
    const text = document.querySelector('.crisis').textContent;
    return [...text.matchAll(/\+?\d[\d\s-]{3,}/g)]
      .map((m) => m[0].trim())
      .filter((n) => !known.some((k) => k.includes(n)));
  });
  expect(strayNumbers, 'something that reads as a hotline number but is not one').toEqual([]);

  expect(errs).toEqual([]);
  await ctx.close();
});
