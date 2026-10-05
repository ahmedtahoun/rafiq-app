import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';
import { DIRECTORY_MEMBER, directoryTables } from './directoryFixture.js';

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
  expect.soft(text, 'slide 2 says messages stay in Rafiq Pro').toContain('stays in Rafiq Pro,');
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

/**
 * The coaching agreement — the waiver a member signs.
 *
 * It was English-only for every member, in both languages, because it was
 * ported 1:1 from a prototype whose own AGREEMENT_TEXT sat outside
 * translations(). A waiver nobody can read is worse than a cosmetic bug:
 * it is the one text in the app a member is asked to agree to.
 */
const AGREEMENT_CATEGORIES = ['Physical', 'Emotional', 'General'];

test('an Arabic member sees the coaching agreement in Arabic', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', lang: 'ar' });
  // The waiver sits behind a collapse, and the card itself only renders
  // signed out — see the note on ClientProfile.tsx:298.
  await page.locator('.client-profile-agreement-row').click();
  await page.waitForTimeout(150);

  const check = await page.evaluate(async (cats) => {
    const { translate } = await import('/src/lib/i18n.ts');
    const body = document.querySelector('.client-profile-agreement-body')?.textContent?.trim() ?? '';
    return {
      body,
      isArabic: cats.map((c) => translate('ar', `agreement${c}Body`)).includes(body),
      isEnglish: cats.map((c) => translate('en', `agreement${c}Body`)).includes(body),
      hasLatin: /[A-Za-z]/.test(body),
    };
  }, AGREEMENT_CATEGORIES);

  expect.soft(check.body, 'the agreement card renders its text').not.toBe('');
  expect.soft(check.isEnglish, 'not the English waiver').toBe(false);
  expect.soft(check.isArabic, 'one of the three Arabic waivers, verbatim').toBe(true);
  expect.soft(check.hasLatin, 'no Latin letters left in the Arabic waiver').toBe(false);
  expect.soft(errs, 'no page errors').toEqual([]);
  await ctx.close();
});

test('every agreement category has its own written Arabic, and the right one is chosen', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', lang: 'ar' });

  const rows = await page.evaluate(async (cats) => {
    const { translate } = await import('/src/lib/i18n.ts');
    return cats.map((c) => [c, {
      enTitle: translate('en', `agreement${c}Title`),
      arTitle: translate('ar', `agreement${c}Title`),
      enBody: translate('en', `agreement${c}Body`),
      arBody: translate('ar', `agreement${c}Body`),
    }]);
  }, AGREEMENT_CATEGORIES);

  for (const [c, v] of rows) {
    expect.soft(v.arTitle, `${c}: an Arabic title, not the English one`).not.toBe(v.enTitle);
    expect.soft(v.arBody, `${c}: an Arabic body, not the English one`).not.toBe(v.enBody);
    expect.soft(/[A-Za-z]/.test(`${v.arTitle} ${v.arBody}`), `${c}: no Latin letters in the Arabic`).toBe(false);
    // A placeholder or a bare key name would pass the checks above; a waiver
    // is a paragraph.
    expect.soft(v.arBody.length > 120, `${c}: the Arabic body is a real paragraph (${v.arBody.length} chars)`).toBe(true);
  }

  // The category comes from the coach's specialty, and the keys follow the
  // category. A specialty in neither list falls back to the general waiver.
  const mapped = await page.evaluate(async () => {
    const { getAgreementInfo } = await import('/src/lib/mockStore.ts');
    return {
      diving: getAgreementInfo('Free diving coaching').category,
      breakup: getAgreementInfo('Breakup coaching').category,
      career: getAgreementInfo('Career coaching').category,
      none: getAgreementInfo('').category,
      info: getAgreementInfo('Yoga coaching'),
    };
  });
  expect.soft(mapped.diving, 'a physical specialty takes the safety waiver').toBe('physical');
  expect.soft(mapped.breakup, 'an emotional specialty takes the scope-of-practice agreement').toBe('emotional');
  expect.soft(mapped.career, 'anything else takes the general agreement').toBe('general');
  expect.soft(mapped.none, 'no specialty takes the general agreement').toBe('general');
  expect.soft(mapped.info.titleKey, 'the info carries a key, not baked-in English').toBe('agreementPhysicalTitle');
  expect.soft(mapped.info.bodyKey, 'the info carries a key, not baked-in English').toBe('agreementPhysicalBody');

  expect.soft(errs, 'no page errors').toEqual([]);
  await ctx.close();
});

// Which document each policy screen renders, so a section count comes from
// the app's own POLICY_SECTION_COUNT rather than a number typed in here.
const PREFIX_OF = {
  coachPrivacyPolicy: 'privacySection',
  clientPrivacyPolicy: 'clientPrivacySection',
  coachTermsOfService: 'termsSection',
  clientTermsOfService: 'clientTermsSection',
};
const sectionCount = (page, screen) => page.evaluate(async (p) => {
  const { POLICY_SECTION_COUNT } = await import('/src/components/PolicyPage.tsx');
  return POLICY_SECTION_COUNT[p];
}, PREFIX_OF[screen]);

test('both privacy policies say messaging is in-app', async ({ browser }) => {
  for (const screen of ['coachPrivacyPolicy', 'clientPrivacyPolicy']) {
    const { page, ctx } = await open(browser, { screen });
    const text = await frame(page);
    const sections = await sectionCount(page, screen);
    expect.soft(await page.locator('.policy-page-section').count(), `${screen}: ${sections} sections`).toBe(sections);
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
      // The document's own numbered sections, plus one more block on the
      // two Terms documents: "Coaching is not therapy" plus the crisis
      // lines, which <NotTherapySection> renders with the same section
      // class. The count comes from the app so this cannot drift from it —
      // the privacy policies have ten sections and the terms six.
      const expected = await sectionCount(page, screen) + (screen.toLowerCase().includes('terms') ? 1 : 0);
      expect.soft(await page.locator('.policy-page-section').count(), `${screen}/${lang}: ${expected} sections`).toBe(expected);
      const text = await frame(page);
      // A key that is missing renders as its own name; this catches that.
      expect.soft(/privacySection|termsSection|clientPrivacySection|clientTermsSection|notTherapy|crisis[A-Z]/.test(text),
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
  // state and has no day strip at all. The demo has no coaches any more, so
  // a signed-in member previews one from the test directory.
  const { page, ctx } = await open(browser);
  await installFakeSupabase(page, { userId: DIRECTORY_MEMBER, tables: directoryTables() });
  await signIn(page, DIRECTORY_MEMBER);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'coachPreview', params: { coachId: 'c-laila' } }));
  await page.locator('.coach-preview-day').first().waitFor();
  const text = await frame(page);
  expect.soft(/MON|TUE|WED/.test(text), 'coachPreview: day names render').toBe(true);
  expect.soft(/dowShort|dowFull/.test(text), 'coachPreview: no raw day keys').toBe(false);
  await ctx.close();
});

/**
 * App Review rejects a button that looks like it takes payment and does
 * not. Rafiq has no payment integration wired to the app yet, so no
 * string may offer to charge a card, and no screen may claim a payment
 * was made. Source-level rather than per-screen: the point is that the
 * wording cannot come back anywhere, including on a screen no test walks.
 */
test('no copy offers a card payment the app cannot take', async () => {
  const { readFileSync } = await import('node:fs');
  const dict = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8');

  const banned = [
    [/Pay with card/i, 'an English offer to charge a card'],
    [/ادفع بالبطاقة/, 'an Arabic offer to charge a card'],
    [/no real payment is processed/i, 'the English "this is a demo" payment note'],
    [/لا يتم تنفيذ أي دفع فعلي/, 'the Arabic "this is a demo" payment note'],
  ];
  for (const [re, what] of banned) {
    expect(dict, `i18n.ts still contains ${what}`).not.toMatch(re);
  }
});
