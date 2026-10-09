import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, dbRows } from './fakeSupabase.js';

/**
 * The coaching agreement, signed for real (issue #143, migration 0028).
 *
 * - The coach sends it from the member's page and sees it sent, then
 *   signed, when and in which language. A walk-in has no card.
 * - The member sees it on Profile once sent: the agreement for the coach's
 *   specialty, in the app's language, and signs with an unticked checkbox,
 *   then the button. Never a single tap.
 * - A signature sends sign_agreement() the category, the language and the
 *   SHA-256 of exactly the title and body on screen, so an Arabic reader's
 *   signature is of the Arabic text.
 */

const COACH = 'coach-a';
const MEMBER = 'member-1';
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const client = (extra = {}) => ({
  id: 'rel-a', coach_id: COACH, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: '', specialty: 'Career coaching', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0',
  active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
  payment_status: 'due', goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_created_at: null,
  invite_expires_at: null, created_at: '2026-09-01T00:00:00Z', ...extra,
});

const tables = ({ agreement = null, coachTitle = 'Breakup coaching', clients = [client()] } = {}) => ({
  profiles: [
    { id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active', role: 'client' },
    { id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active', avatar_photo_url: null },
  ],
  member_profiles: [{ profile_id: MEMBER, goal: '', focus: 'career', signup_completed_at: '2026-09-01T00:00:00Z' }],
  coach_profiles: [{ profile_id: COACH, title: coachTitle }],
  coach_directory: [{
    coach_id: COACH, full_name: 'Dina Farouk', title: coachTitle, verified: true, rating_count: 0, rating_avg: null,
    bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
  }],
  clients,
  agreements: agreement ? [{ client_id: 'rel-a', status: 'sent', sent_at: '2026-10-01T09:00:00Z', signed_at: null, lang: null, ...agreement }] : [],
  tasks: [], packages: [], payments: [], sessions: [], time_blocks: [], messages: [], message_reads: [], client_private: [],
  mood_checkins: [], session_requests: [], weekly_availability: [], ratings: [], notifications: [], subscriptions: [],
});

async function open(browser, { role = 'client', lang = 'en', dark = false, data = tables(), signedIn = true, fail = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(([r, l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [role, lang, dark]);
  await page.reload();
  if (signedIn) {
    const who = role === 'coach' ? COACH : MEMBER;
    await installFakeSupabase(page, { userId: who, tables: data, fail });
    await signIn(page, who);
  }
  return { page, ctx, errs };
}

async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  await page.evaluate(() => window.__screenSettled());
}

/** The agreement's title and body in `lang`, from i18n.ts. */
const text = (page, lang, category) => page.evaluate(async ([l, c]) => {
  const { translate } = await import('/src/lib/i18n.ts');
  return { title: translate(l, `agreement${c}Title`), body: translate(l, `agreement${c}Body`) };
}, [lang, category]);

const signCalls = async (page) => (await dbCalls(page)).filter((c) => c.op === 'rpc' && c.fn === 'sign_agreement').map((c) => c.args);

const COPY = {
  en: { awaiting: 'Awaiting your review', confirm: 'I have read this agreement and I agree to it.', sign: 'Sign agreement', signedOn: /^Signed on / },
  ar: { awaiting: 'بانتظار موافقتك', confirm: 'قرأتُ هذا الاتفاق وأوافق عليه.', sign: 'توقيع الاتفاق', signedOn: /^وُقّع في / },
};

// --- The member -------------------------------------------------------------------------------

for (const [lang, dark] of [['en', false], ['ar', true]]) {
  test(`the member signs with a tick, then the button, and the signature is of what they read (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, dark, data: tables({ agreement: {} }) });
    await go(page, 'clientProfile');
    const { title, body } = await text(page, lang, 'Emotional');
    const card = page.locator('.client-profile-agreement-card');
    // Breakup coaching: the scope-of-practice agreement, in the app's language.
    await expect(card.locator('.client-profile-card-title')).toHaveText(title);
    await expect(card.locator('.client-profile-agreement-status')).toHaveText(COPY[lang].awaiting);
    await card.locator('.client-profile-agreement-row').click();
    await expect(card.locator('.client-profile-agreement-body')).toHaveText(body);

    const box = page.getByRole('checkbox', { name: COPY[lang].confirm });
    const button = page.getByRole('button', { name: COPY[lang].sign });
    await expect(box).not.toBeChecked();
    await expect(button).toBeDisabled();
    // Never a single tap: the button does nothing until the box is ticked.
    await button.click({ force: true });
    expect(await signCalls(page)).toEqual([]);

    await box.check();
    await expect(button).toBeEnabled();
    await button.click();
    await expect(card.locator('.client-profile-agreement-status')).toHaveText(COPY[lang].signedOn);
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    expect(await signCalls(page)).toEqual([{
      p_client: 'rel-a', p_category: 'emotional', p_lang: lang, p_text_sha256: sha256(`${title}\n\n${body}`),
    }]);
    const [row] = await dbRows(page, 'agreements');
    expect([row.status, row.lang, row.category, row.signed_by]).toEqual(['signed', lang, 'emotional', MEMBER]);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('an Arabic reader signs the Arabic text: its hash, not the English one', async ({ browser }) => {
  const { page, ctx } = await open(browser, { lang: 'ar', data: tables({ agreement: {} }) });
  await go(page, 'clientProfile');
  const ar = await text(page, 'ar', 'Emotional');
  const en = await text(page, 'en', 'Emotional');
  await page.locator('.client-profile-agreement-row').click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: COPY.ar.sign }).click();
  await expect(page.locator('.client-profile-agreement-status')).toHaveText(COPY.ar.signedOn);
  const [call] = await signCalls(page);
  expect(call.p_lang).toBe('ar');
  expect(call.p_text_sha256).toBe(sha256(`${ar.title}\n\n${ar.body}`));
  expect(call.p_text_sha256).not.toBe(sha256(`${en.title}\n\n${en.body}`));
  await ctx.close();
});

test('a coach of several specialties: the most protective agreement any of them needs', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: tables({ agreement: {}, coachTitle: 'Life coaching · Yoga coaching' }) });
  await go(page, 'clientProfile');
  const { title } = await text(page, 'en', 'Physical');
  await expect(page.locator('.client-profile-agreement-card .client-profile-card-title')).toHaveText(title);
  await ctx.close();
});

test('nothing to sign until the coach sends it; once signed, it says when and asks nothing', async ({ browser }) => {
  const none = await open(browser);
  await go(none.page, 'clientProfile');
  await expect(none.page.locator('.client-profile-section-label').first()).toBeVisible();
  await expect(none.page.locator('.client-profile-agreement-card')).toHaveCount(0);
  await none.ctx.close();

  const signed = await open(browser, { data: tables({ agreement: { status: 'signed', signed_at: '2026-10-02T09:00:00Z', lang: 'en' } }) });
  await go(signed.page, 'clientProfile');
  await expect(signed.page.locator('.client-profile-agreement-status')).toHaveText(/^Signed on .*2/);
  await signed.page.locator('.client-profile-agreement-row').click();
  await expect(signed.page.locator('.client-profile-agreement-body')).toBeVisible();
  await expect(signed.page.getByRole('checkbox')).toHaveCount(0);
  await expect(signed.page.getByRole('button', { name: COPY.en.sign })).toHaveCount(0);
  await signed.ctx.close();
});

test('a signature that fails says so and stays unsigned', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: tables({ agreement: {} }) });
  await go(page, 'clientProfile');
  await page.evaluate(() => { window.__fake.fail = ['rpc.sign_agreement']; });
  await page.locator('.client-profile-agreement-row').click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: COPY.en.sign }).click();
  await expect(page.locator('.client-profile-agreement-error')).toHaveText("Couldn't sign the agreement. Check your connection and try again.");
  await expect(page.locator('.client-profile-agreement-status')).toHaveText(COPY.en.awaiting);
  expect((await dbRows(page, 'agreements'))[0].status).toBe('sent');
  await ctx.close();
});

test('a failed read says so, never the demo, and Try again loads it', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: tables({ agreement: {} }), fail: ['agreements'] });
  await go(page, 'clientProfile');
  const failed = page.locator('.client-profile-agreement-failed');
  await expect(failed).toContainText("Couldn't load your agreement.");
  await page.evaluate(() => { window.__fake.fail = []; });
  await failed.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.client-profile-agreement-status')).toHaveText(COPY.en.awaiting);
  await ctx.close();
});

test('signed out, the demo asks for the tick too', async ({ browser }) => {
  const { page, ctx } = await open(browser, { signedIn: false });
  await go(page, 'clientProfile');
  await page.locator('.client-profile-agreement-row').click();
  const button = page.getByRole('button', { name: COPY.en.sign });
  await expect(button).toBeDisabled();
  await page.getByRole('checkbox', { name: COPY.en.confirm }).check();
  await button.click();
  await expect(page.locator('.client-profile-agreement-status')).toHaveText(COPY.en.signedOn);
  await ctx.close();
});

// --- The coach ---------------------------------------------------------------------------------

const COACH_COPY = {
  en: { none: 'Not sent yet. Hana Mostafa reads and signs it in the app.', send: 'Send agreement', sent: /^Sent .* · waiting for a signature$/, signedAr: /^Signed .*, in Arabic$/ },
  ar: { none: 'لم يُرسَل إلى Hana Mostafa بعد. القراءة والتوقيع داخل التطبيق.', send: 'إرسال الاتفاق', sent: /^أُرسل في .* · بانتظار التوقيع$/, signedAr: /^وُقّع في .*، بالعربية$/ },
};

for (const [lang, dark] of [['en', false], ['ar', true]]) {
  test(`the coach sends it from the member's page and sees it sent (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { role: 'coach', lang, dark });
    await go(page, { screen: 'clientDetail', params: { clientId: 'rel-a' } });
    const card = page.locator('.client-detail-agreement');
    await expect(card.locator('.client-detail-agreement-line')).toHaveText(COACH_COPY[lang].none.replace('Hana Mostafa', '⁨Hana Mostafa⁩'));
    await card.getByRole('button', { name: COACH_COPY[lang].send }).click();
    await expect(card.locator('.client-detail-agreement-line')).toHaveText(COACH_COPY[lang].sent);
    await expect(card.getByRole('button')).toHaveCount(0);
    const inserts = (await dbCalls(page)).filter((c) => c.table === 'agreements' && c.op === 'insert');
    expect(inserts.map((c) => c.values)).toEqual([{ client_id: 'rel-a' }]);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('the coach sees it signed, when, and in which language', async ({ browser }) => {
  for (const lang of ['en', 'ar']) {
    const { page, ctx } = await open(browser, {
      role: 'coach', lang, data: tables({ agreement: { status: 'signed', signed_at: '2026-10-02T09:00:00Z', lang: 'ar' } }),
    });
    await go(page, { screen: 'clientDetail', params: { clientId: 'rel-a' } });
    await expect(page.locator('.client-detail-agreement-line')).toHaveText(COACH_COPY[lang].signedAr);
    await ctx.close();
  }
});

test('a walk-in with no account has no agreement card', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'coach', data: tables({ clients: [client({ member_id: null })] }) });
  await go(page, { screen: 'clientDetail', params: { clientId: 'rel-a' } });
  await expect(page.locator('.client-detail-invite-card')).toBeVisible();
  await expect(page.locator('.client-detail-agreement')).toHaveCount(0);
  expect((await dbCalls(page)).filter((c) => c.table === 'agreements')).toEqual([]);
  await ctx.close();
});

test('a send that fails says so and leaves it unsent', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'coach' });
  await go(page, { screen: 'clientDetail', params: { clientId: 'rel-a' } });
  await page.evaluate(() => { window.__fake.fail = ['agreements.insert']; });
  await page.getByRole('button', { name: COACH_COPY.en.send }).click();
  await expect(page.locator('.client-detail-agreement-error')).toHaveText('Something went wrong. Please try again.');
  await expect(page.getByRole('button', { name: COACH_COPY.en.send })).toBeEnabled();
  await ctx.close();
});
