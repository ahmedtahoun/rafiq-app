import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * The coach's private notes on a member, on Add member and Edit member,
 * carry one line: members can ask to see them. Notes about a person are
 * that person's data under Law 151/2020, so a coach writing candidly in the
 * belief they can never be seen should be told (store/app-privacy.md §2,
 * §9). The line is tied to the field (aria-describedby), so a screen reader
 * reads it with the field, not somewhere after it.
 */

const COACH = 'coach-1';

const tables = () => ({
  profiles: [{ id: COACH, full_name: 'Nadia Shawky', role: 'coach', account_status: 'active', phone: '', country_code: '+20', email: 'n@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null }],
  coach_profiles: [{ profile_id: COACH, title: 'Career coaching', cert: '', bio: '', languages: [], session_mode: 'online', experience_years: 2, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  clients: [{
    id: 'c-tarek', coach_id: COACH, member_id: null, full_name: 'Tarek Zaki', age: null, phone: '', country_code: '+20', email: null, city: null,
    program: 'Career coaching · Basic', specialty: 'Career coaching', plan: 'Basic', initials: 'TZ', avatar_bg: '#3E6FB0', active: true, progress: 40,
    needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false, payment_status: 'due', goal: 'A new role',
    focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null, created_at: '2026-09-01T00:00:00Z',
  }],
  client_private: [{ client_id: 'c-tarek', notes: 'Prefers mornings', is_favourite: false }],
  tasks: [], subscriptions: [],
});

const LINE = {
  en: 'Members can ask to see notes written about them.',
  ar: 'يحق للأعضاء طلب الاطلاع على الملاحظات المكتوبة عنهم.',
};

async function open(browser, { lang, dark, signedIn = true }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  if (signedIn) {
    await installFakeSupabase(page, { userId: COACH, tables: tables() });
    await signIn(page, COACH);
  }
  return { page, ctx, errs };
}

async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  await page.evaluate(() => window.__screenSettled());
}

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`the notes field says members can ask to see them (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      for (const [target, id] of [[{ screen: 'editClient', params: { clientId: 'c-tarek' } }, 'ecnotes'], ['addClient', 'acnotes']]) {
        await go(page, target);
        const notes = page.locator(`#${id}`);
        await expect(notes).toBeVisible();
        const hint = page.locator(`#${id}-hint`);
        await expect(hint).toHaveText(LINE[lang]);
        // Read out with the field, and directly under it.
        await expect(notes).toHaveAttribute('aria-describedby', `${id}-hint`);
        const [field, line] = [await notes.boundingBox(), await hint.boundingBox()];
        expect(line.y).toBeGreaterThan(field.y + field.height - 1);
        expect(line.y - (field.y + field.height)).toBeLessThan(24);
      }
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('signed out, the demo\'s notes field says it too', async ({ browser }) => {
  const { page, ctx } = await open(browser, { lang: 'en', dark: false, signedIn: false });
  await go(page, { screen: 'editClient', params: { clientId: 'sara' } });
  await expect(page.locator('#ecnotes-hint')).toHaveText(LINE.en);
  await ctx.close();
});

test('the other text areas carry no hint', async ({ browser }) => {
  const { page, ctx } = await open(browser, { lang: 'en', dark: false });
  await go(page, { screen: 'editClient', params: { clientId: 'c-tarek' } });
  await expect(page.locator('#ecgoal')).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(page.locator('.text-field-hint')).toHaveCount(1);
  await ctx.close();
});
