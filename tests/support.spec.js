import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The support rows on both profiles, and the contact line in both privacy
 * policies.
 *
 * Every one of these used to claim something that did not happen: "Contact
 * Us" toasted "Your message has been sent to Rafiq support" without sending
 * anything, "Buy us a coffee" said it was opening a page and opened none,
 * and "Rate Rafiq" collected five stars into component state that went
 * nowhere. Store reviewers tap exactly these rows. The help centre, Account
 * Details and the privacy policy all point people at Contact Us, so it has
 * to reach a person.
 */

async function open(browser, { screen, role = 'coach', lang = 'en' }) {
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
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(400);
  // openExternal follows a synthetic <a>; record it instead of leaving the page.
  await page.evaluate(() => {
    window.__opened = [];
    HTMLAnchorElement.prototype.click = function () {
      window.__opened.push({ href: this.href, target: this.target });
    };
  });
  return { page, ctx, errs };
}

const opened = (page) => page.evaluate(() => window.__opened);
const supportEmail = (page) => page.evaluate(async () => (await import('/src/lib/support.ts')).SUPPORT_EMAIL);

for (const lang of ['en', 'ar']) {
  test(`pro Contact Us opens an email to support, and claims nothing was sent (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { screen: 'profile', lang });
    const label = lang === 'en' ? 'Contact Us' : 'تواصل معنا';
    await page.locator('.profile-support-row', { hasText: label }).click();

    const links = await opened(page);
    expect(links, 'exactly one link followed').toHaveLength(1);
    const url = new URL(links[0].href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(await supportEmail(page));
    expect(url.searchParams.get('subject')).toBe(lang === 'en' ? 'Rafiq support' : 'دعم رفيق');

    expect(await page.locator('.profile-toast').count(), 'no "message sent" toast').toBe(0);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('pro Rate Rafiq sends a browser to the store listing in a new tab', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await page.locator('.profile-support-row', { hasText: 'Rate Rafiq' }).click();

  const links = await opened(page);
  expect(links).toHaveLength(1);
  expect(links[0].href).toBe('https://play.google.com/store/apps/details?id=app.rafiqie.coach');
  expect(links[0].target).toBe('_blank');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the pro support card has no coffee row', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'profile' });
  const rows = await page.locator('.profile-support-row').allInnerTexts();
  expect(rows.map((r) => r.trim())).toEqual(['Rate Rafiq', 'Contact Us', 'Get Help']);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`member profile has a working Contact Us (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', role: 'client', lang });
    const label = lang === 'en' ? 'Contact Us' : 'تواصل معنا';
    await page.locator('.client-profile-help', { hasText: label }).click();

    const links = await opened(page);
    expect(links).toHaveLength(1);
    expect(links[0].href.startsWith(`mailto:${await supportEmail(page)}?`)).toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

for (const [screen, role] of [['coachPrivacyPolicy', 'coach'], ['clientPrivacyPolicy', 'client']]) {
  for (const lang of ['en', 'ar']) {
    test(`${screen} gives the support address itself (${lang})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { screen, role, lang });
      // The policy text is static copy, so guard it against drifting from
      // the address the Contact Us rows actually open.
      const text = await page.locator('.policy-page-text').allInnerTexts();
      expect(text.join('\n')).toContain(await supportEmail(page));
      // The old copy sent people down a path that does not exist.
      expect(text.join('\n')).not.toContain('Get Help → Contact Us');
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}
