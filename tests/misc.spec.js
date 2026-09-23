import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { screen = 'clientNotifications', lang = 'en', dark = false, seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text()); });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
  }, [lang, dark]);
  await page.reload();
  if (seed) await page.evaluate(async (s) => { const m = await import('/src/lib/mockStore.ts'); await eval(s)(m); }, seed);
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(500);
  return { page, ctx, errs };
}
const screenOf = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const store = (page, fn) => page.evaluate(async (src) => { const m = await import('/src/lib/mockStore.ts'); return eval(src)(m); }, fn);
const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();
const n = (page, sel) => page.locator(sel).count();

// ===========================================================================

test('Notification model: data + target', async ({ browser }) => {
{
  const { page } = await open(browser, {});
  const list = await store(page, `(m) => m.getClientNotifications('sara').map(x => ({ kind: x.kind, unread: x.unread, screen: x.target.screen, data: x.data }))`);

  expect.soft(String(list.every((x) => x.unread)), 'all start unread').toBe('true');
  expect.soft(String(list.every((x) => !!x.screen)), 'every row has a destination').toBe('true');

  const confirmed = list.find((x) => x.kind === 'session-confirmed');
  expect.soft(String(confirmed.data.sessionDisplay), 'confirmed session carries its display string').toBe('Today, 10:00 AM');
  expect.soft(String(confirmed.data.coachName), 'and names the pro').toBe('Yasmin El-Sayed');
  expect.soft(String(confirmed.screen), 'session rows point at the schedule').toBe('clientSchedule');

  const pay = list.find((x) => x.kind === 'payment-overdue');
  expect.soft(String(pay.data.plan), 'payment row carries the plan').toBe('Basic');
  expect.soft(String(pay.screen), 'payment rows point at the pro').toBe('clientCoach');

  // Sara's only "due today" task is already ticked, so nothing is overdue
  // on a fresh install — that is the store's rule, not a gap.
  expect.soft(String(list.some((x) => x.kind === 'task-overdue')), 'no overdue-task row while that task is done').toBe('false');
  await page.close();
}
{
  // Untick it and the row appears, carrying its count and first title.
  const seed = `(m) => { m.toggleTask('sara','t1'); return 1; }`;
  const { page } = await open(browser, { seed });
  const task = await store(page, `(m) => m.getClientNotifications('sara').find(x => x.kind === 'task-overdue')`);
  expect.soft(String(task.data.count), 'overdue task carries a count').toBe('1');
  expect.soft(String(task.data.firstTitle), 'and the first title').toBe('Log post-session mood rating');
  expect.soft(String(task.target.screen), 'task rows point at tasks').toBe('clientTasks');
  await page.close();
}
{
  const seed = `(m) => { m.addCustomBlock({ clientId: 'sara', kind: 'pending', label: 'Sara Ahmed', dayIndex: 3, startH: 10, endH: 10.75 }); return 1; }`;
  const { page } = await open(browser, { seed });
  const pending = await store(page, `(m) => m.getClientNotifications('sara').find(x => x.kind === 'session-pending')`);
  expect.soft(String(pending.data.range), 'a pending request carries its slot').toBe('10:00 – 10:45 AM');
  await page.close();
}
{
  const seed = `(m) => { m.setRecap('sara','sess1','Great progress this week.'); return 1; }`;
  const { page } = await open(browser, { seed });
  const fb = await store(page, `(m) => m.getClientNotifications('sara').find(x => x.kind === 'feedback')`);
  expect.soft(String(fb.data.recapText), 'feedback carries the recap itself').toBe('Great progress this week.');
  expect.soft(String(fb.target.screen), 'feedback points at the pro').toBe('clientCoach');
  await page.close();
}

// ===========================================================================
});

test('ClientNotifications', async ({ browser }) => {
{
  // Seeded so all four icon families are on screen at once.
  const seed = `(m) => { m.toggleTask('sara','t1'); m.setRecap('sara','sess1','Great progress this week.'); return 1; }`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(await screenOf(page)), 'screen is clientNotifications').toBe('clientNotifications');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-notifications-title')), 'title').toBe('Notifications');
  const rows = await n(page, '.client-notifications-row');

  expect.soft(String(rows), 'rows rendered').toBe('4');
  expect.soft(String(await n(page, '.client-notifications-dot')), 'every row is unread to start').toBe(String(rows));
  expect.soft(String(await n(page, '.client-notifications-mark-all')), 'mark-all offered while something is unread').toBe('1');
  expect.soft(String((await n(page, '.client-notifications-sub')) > 0), 'subtitles render').toBe('true');

  // Icon families differ by kind.
  expect.soft(String(await n(page, '.client-notifications-icon-session')), 'session icon').toBe('1');
  expect.soft(String(await n(page, '.client-notifications-icon-task')), 'task icon').toBe('1');
  expect.soft(String(await n(page, '.client-notifications-icon-message')), 'message icon for feedback').toBe('1');
  expect.soft(String((await n(page, '.client-notifications-icon-payment')) >= 1), 'payment icons').toBe('true');

  await page.locator('.client-notifications-mark-all').click();
  await page.waitForTimeout(400);
  expect.soft(String(await n(page, '.client-notifications-dot')), 'mark all clears every dot').toBe('0');
  expect.soft(String(await n(page, '.client-notifications-row')), 'rows stay, just read').toBe(String(rows));
  expect.soft(String(await store(page, `(m) => m.getClientNotifications('sara').some(x => x.unread)`)), 'all marked read in the store').toBe('false');
  expect.soft(String(await n(page, '.client-notifications-mark-all')), 'mark-all withdrawn once nothing is unread').toBe('0');
  await page.close();
}
{
  const { page } = await open(browser, {});
  const firstId = await store(page, `(m) => m.getClientNotifications('sara')[0].id`);
  await page.locator('.client-notifications-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await screenOf(page)), 'tapping a row navigates').toBe('clientSchedule');
  expect.soft(String(await store(page, `(m) => m.getClientNotifications('sara').filter(x => !x.unread).length`)), 'and marks just that one read').toBe('1');
  expect.soft(String(await store(page, `(m) => m.getClientNotifications('sara').find(x => !x.unread).id`)), 'the right one').toBe(String(firstId));
  await page.close();
}
{
  // Prefs off → the store returns nothing, and the screen says so honestly.
  const seed = `(m) => { m.setNotificationPrefs({ enabled: false }); return 1; }`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await n(page, '.client-notifications-row')), 'no rows').toBe('0');
  expect.soft(String(await txt(page, '.client-notifications-empty-title')), 'empty state').toBe("You're all caught up!");
  expect.soft(String(await n(page, '.client-notifications-mark-all')), 'no mark-all on an empty list').toBe('0');
  await page.close();
}
{
  // A category toggle filters, rather than the whole list vanishing.
  const seed = `(m) => { m.toggleTask('sara','t1'); m.setNotificationPrefs({ task: false }); return 1; }`;
  const { page } = await open(browser, { seed });
  expect.soft(String(await n(page, '.client-notifications-icon-task')), 'task rows filtered out').toBe('0');
  expect.soft(String((await n(page, '.client-notifications-row')) > 0), 'others still there').toBe('true');
  await page.close();
}

// ===========================================================================
});

test('ClientHelpCenter', async ({ browser }) => {
  const { page, errs } = await open(browser, { screen: 'clientHelpCenter' });
  expect.soft(String(await screenOf(page)), 'screen is clientHelpCenter').toBe('clientHelpCenter');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-help-title')), 'title').toBe('Get Help');
  expect.soft(String(await n(page, '.client-help-question')), 'six questions').toBe('6');
  expect.soft(String(await n(page, '.client-help-answer')), 'first answer open by default').toBe('1');
  expect.soft(String((await txt(page, '.client-help-answer')).includes('Sessions tab')), 'and it is the first').toBe('true');
  expect.soft(String(await page.locator('.client-help-question[aria-expanded="true"]').count()), 'aria-expanded tracks it').toBe('1');

  await page.locator('.client-help-question').nth(2).click();
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-help-answer')), 'opening another closes the first').toBe('1');
  expect.soft(String((await txt(page, '.client-help-answer')).includes('in-app chat')), 'the messaging answer says in-app, not WhatsApp').toBe('true');
  expect.soft(String(/WhatsApp/i.test(await txt(page, '.client-help-answer'))), 'and never mentions WhatsApp').toBe('false');

  await page.locator('.client-help-question').nth(2).click();
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-help-answer')), 'tapping the open one closes it').toBe('0');

  expect.soft(String((await txt(page, '.client-help-contact')).includes('Yasmin El-Sayed')), 'contact button names the pro').toBe('true');
  await page.locator('.client-help-contact').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'contact opens the thread').toBe('coachMessages');
  await page.close();

// ===========================================================================
});

test('Policy screens', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { screen: 'clientPrivacyPolicy' });
  expect.soft(String(await screenOf(page)), 'screen is clientPrivacyPolicy').toBe('clientPrivacyPolicy');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.policy-page-title')), 'title').toBe('Privacy Policy');
  expect.soft(String(await n(page, '.policy-page-section')), 'six sections').toBe('6');
  const body = await page.evaluate(() => document.querySelector('.policy-page-body').innerText);
  // The design's copy claimed messages go through WhatsApp. They don't.
  expect.soft(String(/WhatsApp/i.test(body)), 'does NOT claim messages go through WhatsApp').toBe('false');
  expect.soft(String(/stored in Rafiq/.test(body)), 'says messages are stored in Rafiq').toBe('true');
  expect.soft(String(/covered by this policy/.test(body)), 'and that this policy covers them').toBe('true');
  await page.close();
}
{
  const { page, errs } = await open(browser, { screen: 'clientTermsOfService' });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.policy-page-title')), 'title').toBe('Terms of Service');
  expect.soft(String(await n(page, '.policy-page-section')), 'six sections').toBe('6');
  const body = await page.evaluate(() => document.querySelector('.policy-page-body').innerText);
  // The app enforces a real grace window, so the terms name it.
  expect.soft(String(/12 hours/.test(body)), 'names the real 12-hour grace window').toBe('true');
  expect.soft(String(await store(page, `(m) => m.getCancellationPolicy().graceHours`)), 'grace window matches the store').toBe('12');
  await page.close();
}

// ===========================================================================
});

test('Arabic RTL + dark', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await page.evaluate(() => document.documentElement.dir)), 'direction').toBe('rtl');
  expect.soft(String(await txt(page, '.client-notifications-title')), 'title translated').toBe('الإشعارات');
  expect.soft(String(await txt(page, '.client-notifications-mark-all')), 'mark all translated').toBe('تعليم الكل كمقروء');
  const raw = await page.evaluate(() => document.querySelector('.client-notifications-list').innerText);
  expect.soft(String(/Your payment|overdue task|coming up|pending confirmation/.test(raw)), 'no raw English notification copy in AR').toBe('false');
  await page.close();
}
{
  const { page, errs } = await open(browser, { screen: 'clientHelpCenter', lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-help-title')), 'title translated').toBe('المساعدة');
  expect.soft(String(await txt(page, '.client-help-question-text')), 'question translated').toBe('كيف أحجز جلسة؟');
  await page.close();
}
{
  const { page, errs } = await open(browser, { screen: 'clientPrivacyPolicy', lang: 'ar', dark: false });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.policy-page-title')), 'title translated').toBe('سياسة الخصوصية');
  const body = await page.evaluate(() => document.querySelector('.policy-page-body').innerText);
  expect.soft(String(/واتساب|WhatsApp/i.test(body)), 'AR copy does not say WhatsApp either').toBe('false');
  await page.close();
}
{
  const { page, errs } = await open(browser, { screen: 'clientTermsOfService', lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.policy-page-title')), 'title translated').toBe('شروط الخدمة');
  await page.close();
}

// ===========================================================================
});

test('Retired stubs + navigation', async ({ browser }) => {
{
  const { page } = await open(browser, { screen: 'clientHome' });
  await page.locator('.client-home-icon-btn').nth(2).click();   // bell
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientHome bell → clientNotifications').toBe('clientNotifications');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('discover'));
  await page.waitForTimeout(400);
  const bell = page.locator('[aria-label="Notifications"], .discover-icon-btn').last();
  await bell.click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'Discover bell → clientNotifications').toBe('clientNotifications');
  await page.close();
}
{
  const { page } = await open(browser, { screen: 'clientProfile' });
  const helpBtn = page.locator('button').filter({ hasText: 'Help' }).first();
  await helpBtn.click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientProfile → clientHelpCenter').toBe('clientHelpCenter');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().back());
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'back → clientProfile').toBe('clientProfile');

  await page.locator('button').filter({ hasText: 'Privacy' }).first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientProfile → clientPrivacyPolicy').toBe('clientPrivacyPolicy');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().back());
  await page.waitForTimeout(400);

  await page.locator('button').filter({ hasText: 'Terms' }).first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientProfile → clientTermsOfService').toBe('clientTermsOfService');
  await page.close();
}
{
  // The whole member app should now be free of placeholders.
  const { page } = await open(browser, { screen: 'clientHome' });
  const reachable = await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    const screens = ['clientHome','clientProfile','editClientProfile','discover','coachPreview',
      'clientCoach','clientBooking','clientSchedule','clientTasks','myPrograms','programDetail',
      'rateCoach','coachMessages','myCoaches','clientNotifications','clientHelpCenter',
      'clientPrivacyPolicy','clientTermsOfService'];
    const out = [];
    for (const s of screens) {
      m.useAppStore.getState().nav(s);
      await new Promise((r) => setTimeout(r, 120));
      const el = document.querySelector('.phone-frame');
      out.push({ s, cls: el ? el.className : 'NONE' });
    }
    return out;
  });
  const placeholders = reachable.filter((r) => r.cls.includes('coming-soon') || r.cls === 'NONE');
  expect.soft(String(placeholders.length), 'every member screen renders its own component').toBe('0');
  if (placeholders.length) info('offenders', JSON.stringify(placeholders));
  await page.close();
}
});
