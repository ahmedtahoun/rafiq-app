import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { screen = 'clientSchedule', lang = 'en', dark = false, local = {}, seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text()); });
  await page.goto('/');
  await page.evaluate(([l, d, loc]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    for (const [k, v] of Object.entries(loc)) localStorage.setItem(k, v);
  }, [lang, dark, local]);
  await page.reload();
  if (seed) await page.evaluate(async (src) => { const m = await import('/src/lib/mockStore.ts'); await eval(src)(m); }, seed);
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(500);
  return { page, ctx, errs };
}
const screenOf = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const store = (page, fn) => page.evaluate(async (src) => { const m = await import('/src/lib/mockStore.ts'); return eval(src)(m); }, fn);
const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();
const n = (page, sel) => page.locator(sel).count();

// ===========================================================================

test('ClientSchedule: seeded state (confirmed session, no block)', async ({ browser }) => {
  const { page, errs } = await open(browser, {});
  expect.soft(String(await screenOf(page)), 'screen is clientSchedule').toBe('clientSchedule');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-schedule-title')), 'title').toBe('Sessions');
  expect.soft(String((await txt(page, '.client-schedule-subtitle')).includes('Yasmin')), 'subtitle names the pro').toBe('true');
  expect.soft(String(await n(page, '.client-schedule-upcoming-card')), 'upcoming card shown').toBe('1');
  expect.soft(String(await txt(page, '.client-schedule-status')), 'status reads Confirmed').toBe('CONFIRMED');
  expect.soft(String(await txt(page, '.client-schedule-upcoming-when')), 'shows the seeded time').toBe('Today, 10:00 AM');
  expect.soft(String(await txt(page, '.client-schedule-upcoming-type')), 'session type falls back to 50-min').toBe('50-Minute Session');
  expect.soft(String(await n(page, '.client-schedule-join')), 'join button shown (session is today)').toBe('1');
  // No block behind the seeded display, so reschedule has nothing to move.
  expect.soft(String(await n(page, '.client-schedule-action-blocked')), 'reschedule offered as blocked text').toBe('1');
  expect.soft(String(await n(page, 'button.client-schedule-action:has-text("Reschedule")')), 'reschedule button absent').toBe('0');
  expect.soft(String((await txt(page, '.client-schedule-action-blocked')).includes("isn't available")), 'blocked reason is the generic one').toBe('true');
  expect.soft(String(await n(page, '.client-schedule-history-row')), 'two fallback history rows').toBe('2');
  expect.soft(String(await txt(page, '.client-schedule-history-date')), 'history dates').toBe('Oct 18, 2025');
  expect.soft(String(await n(page, '.client-schedule-rate')), 'unrated sessions offer Rate').toBe('2');
  expect.soft(String(await n(page, '.client-schedule-request')), 'request-a-session CTA present').toBe('1');
  await page.close();

// ===========================================================================
});

test('ClientSchedule: a real pending request', async ({ browser }) => {
  // Thursday (dayIndex 3) 10:00–10:45 — 34h out, comfortably past the
  // 12h grace window, so this one can be moved.
  const seed = `(m) => m.addCustomBlock({ clientId: 'sara', kind: 'pending', label: 'Sara Ahmed · Requested', dayIndex: 3, startH: 10, endH: 10.75, sessionType: 'short' })`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-schedule-status')), 'status reads Pending').toBe('PENDING');
  expect.soft(String(await txt(page, '.client-schedule-upcoming-when')), 'shows the block day + range').toBe('Thursday, 10:00 AM – 10:45 AM');
  // Day name + both ends of the range each get their own <bdi>.
  expect.soft(String(await n(page, '.client-schedule-upcoming-when bdi')), 'range ends isolated with bdi').toBe('3');
  expect.soft(String(await txt(page, '.client-schedule-upcoming-type')), 'session type is the booked one').toBe('25-Minute Session');
  expect.soft(String(await n(page, '.client-schedule-join')), 'join button hidden while pending').toBe('0');
  expect.soft(String(await n(page, 'button.client-schedule-action:has-text("Reschedule")')), 'reschedule is offered').toBe('1');
  expect.soft(String(await n(page, '.client-schedule-action-blocked')), 'no blocked message').toBe('0');

  // --- reschedule it ---
  await page.locator('button.client-schedule-action:has-text("Reschedule")').click();
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-schedule-sheet')), 'sheet opens').toBe('1');
  expect.soft(String(await txt(page, '.client-schedule-day-on .client-schedule-day-num')), 'sheet opens on the session day').toBe('23');
  expect.soft(String(await page.locator('.client-schedule-day[disabled]').count()), 'past days disabled').toBe('2');
  expect.soft(String(await page.locator('.client-schedule-sheet-confirm').isDisabled()), 'confirm disabled until a slot is picked').toBe('true');
  const slots = await n(page, '.client-schedule-slot');

  expect.soft(String(slots > 0), 'slots are offered').toBe('true');

  await page.locator('.client-schedule-day').nth(5).click();     // Saturday
  await page.waitForTimeout(200);
  expect.soft(String(await page.locator('.client-schedule-sheet-confirm').isDisabled()), 'day switch clears the slot').toBe('true');
  await page.locator('.client-schedule-slot').nth(1).click();
  await page.waitForTimeout(150);
  expect.soft(String(await page.locator('.client-schedule-sheet-confirm').isDisabled()), 'confirm enabled after picking').toBe('false');
  await page.locator('.client-schedule-sheet-confirm').click();
  await page.waitForTimeout(350);

  expect.soft(String(await n(page, '.client-schedule-sheet')), 'sheet closed').toBe('0');
  const moved = await store(page, `(m) => { const b = m.getCustomBlocks().find(x => x.clientId === 'sara'); return { day: m.blockDayIndex(b), start: m.blockStartH(b), dur: m.blockEndH(b) - m.blockStartH(b), kind: b.kind, n: m.getCustomBlocks().length }; }`);
  expect.soft(String(moved.day), 'moved to Saturday').toBe('5');
  expect.soft(String(moved.dur), 'duration preserved (25 min → 0.75h slot span kept)').toBe('0.75');
  expect.soft(String(moved.kind), 'still pending').toBe('pending');
  expect.soft(String(moved.n), 'moved in place, not duplicated').toBe('1');

  expect.soft(String((await txt(page, '.client-schedule-upcoming-when')).startsWith('Saturday')), 'header now shows Saturday').toBe('true');
  await page.close();

// ===========================================================================
});

test('ClientSchedule: inside the grace window', async ({ browser }) => {
  // Today (dayIndex 2) at 10:00 is 10h from the store's fixed "now" —
  // inside the 12h grace window.
  const seed = `(m) => m.addCustomBlock({ clientId: 'sara', kind: 'pending', label: 'Sara Ahmed · Requested', dayIndex: 2, startH: 10, endH: 10.75, sessionType: 'standard' })`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await n(page, 'button.client-schedule-action:has-text("Reschedule")')), 'reschedule button withheld').toBe('0');
  const reason = await txt(page, '.client-schedule-action-blocked');
  expect.soft(String(reason.includes('12h')), 'reason names the notice period').toBe('true');

  await page.locator('button.client-schedule-action:has-text("Cancel")').click();
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-schedule-dialog')), 'cancel dialog opens').toBe('1');
  expect.soft(String(await n(page, '.client-schedule-dialog-warn')), 'forfeit warning shown inside grace').toBe('1');
  expect.soft(String((await txt(page, '.client-schedule-dialog-warn')).includes('12h')), 'warning names the window').toBe('true');

  const before = await store(page, `(m) => m.getPackageStatus('sara').used`);
  await page.locator('.client-schedule-dialog-cancel').click();
  await page.waitForTimeout(350);
  const after = await store(page, `(m) => ({ used: m.getPackageStatus('sara').used, blocks: m.getCustomBlocks().length, cxl: m.getCancellations('sara').length })`);
  expect.soft(String(after.blocks), 'block removed').toBe('0');
  expect.soft(String(after.cxl), 'cancellation recorded').toBe('1');
  expect.soft(String(after.used), 'late cancel forfeits a credit').toBe(String(before + 1));
  expect.soft(String(await n(page, '.client-schedule-dialog')), 'dialog closed').toBe('0');
  await page.close();

// ===========================================================================
});

test('ClientSchedule: no upcoming session', async ({ browser }) => {
  const seed = `(m) => m.updateClient('sara', { nextSessionAtMs: null })`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await n(page, '.client-schedule-upcoming-card')), 'upcoming card hidden').toBe('0');
  expect.soft(String(await txt(page, '.client-schedule-empty-title')), 'empty state shown').toBe('No upcoming session');
  expect.soft(String(await n(page, '.client-schedule-history-row')), 'history still listed').toBe('2');
  await page.locator('.client-schedule-request').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'request CTA opens booking').toBe('clientBooking');
  await page.close();

// ===========================================================================
});

test('ClientSchedule: recaps + ratings', async ({ browser }) => {
  const seed = `(m) => { m.setRecap('sara', 'sess1', 'Great progress on the morning routine.'); return m.getRatings; }`;
  const { page } = await open(browser, { seed, local: { rafiq_ratings_sara: JSON.stringify({ sess2: { rating: 4 } }) } });
  expect.soft(String(await txt(page, '.client-schedule-history-note')), 'recap replaces the default note').toBe('Great progress on the morning routine.');
  expect.soft(String(await txt(page, '.client-schedule-rated')), 'rated session shows stars').toBe('★★★★');
  expect.soft(String(await n(page, '.client-schedule-rate')), 'only the unrated one offers Rate').toBe('1');
  expect.soft(String((await page.locator('.client-schedule-history-note').nth(1).innerText()).trim()), 'second row keeps the default note').toBe('Session completed');
  await page.close();

// ===========================================================================
});

test('ClientSchedule: Arabic RTL + dark', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await page.evaluate(() => document.documentElement.dir)), 'document direction').toBe('rtl');
  expect.soft(String(await page.evaluate(() => document.documentElement.dataset.theme)), 'dark theme applied').toBe('dark');
  expect.soft(String(await txt(page, '.client-schedule-title')), 'title translated').toBe('الجلسات');
  expect.soft(String(await txt(page, '.client-schedule-h2')), 'history heading translated').toBe('سجل الجلسات');
  expect.soft(String(await txt(page, '.client-schedule-status')), 'status translated').toBe('مؤكدة');
  const raw = await page.evaluate(() => document.querySelector('.client-schedule-scroll').innerText);
  expect.soft(String(/Session History|Request a session|Rate\b/.test(raw)), 'no raw English leaked into the AR body').toBe('false');
  await page.close();
}
{
  // A real pending block in Arabic: day name and AM/PM both translated.
  const seed = `(m) => m.addCustomBlock({ clientId: 'sara', kind: 'pending', label: 'Sara Ahmed', dayIndex: 3, startH: 10, endH: 10.75, sessionType: 'short' })`;
  const { page, errs } = await open(browser, { lang: 'ar', dark: true, seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  const when = await txt(page, '.client-schedule-upcoming-when');
  expect.soft(String(when.includes('خميس')), 'day name translated').toBe('true');
  expect.soft(String(when.includes('صباحًا')), 'AM/PM translated').toBe('true');
  expect.soft(String(/\bAM\b|\bPM\b/.test(when)), 'no English AM/PM in the AR range').toBe('false');
  expect.soft(String(await txt(page, '.client-schedule-upcoming-type')), 'session type translated').toBe('جلسة 25 دقيقة');
  await page.locator('button.client-schedule-action').first().click();
  await page.waitForTimeout(300);
  expect.soft(String(await txt(page, '.client-schedule-sheet-title')), 'reschedule sheet translated').toBe('إعادة جدولة الجلسة');
  const slotText = await txt(page, '.client-schedule-slot');
  expect.soft(String(/صباحًا|مساءً/.test(slotText)), 'slot labels translated').toBe('true');
  await page.close();
}

// ===========================================================================
});

test('ClientSchedule: navigation', async ({ browser }) => {
  const { page } = await open(browser, {});
  await page.locator('.bottom-nav-item').nth(3).click();   // Tasks
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'nav → clientTasks').toBe('clientTasks');
  await page.locator('.bottom-nav-item').nth(1).click();   // Home
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'nav → clientHome').toBe('clientHome');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientSchedule'));
  await page.waitForTimeout(300);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().back());
  await page.waitForTimeout(300);
  expect.soft(String(await screenOf(page)), 'back from a root falls to clientHome').toBe('clientHome');
  await page.close();

// ===========================================================================
});

test('ClientTasks: seeded state', async ({ browser }) => {
  const { page, errs } = await open(browser, { screen: 'clientTasks' });
  expect.soft(String(await screenOf(page)), 'screen is clientTasks').toBe('clientTasks');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.client-tasks-title')), 'title').toBe('My Tasks');
  expect.soft(String((await txt(page, '.client-tasks-subtitle')).includes('Yasmin')), 'subtitle names the pro').toBe('true');
  expect.soft(String(await txt(page, '.client-tasks-ring-value')), 'progress ring value').toBe('63%');
  expect.soft(String(await txt(page, '.client-tasks-progress-goal')), 'goal from the client record').toBe('Build a consistent morning routine');
  expect.soft(String(await txt(page, '.client-tasks-progress-sessions')), 'sessions line').toBe('2 of 8 sessions completed');
  expect.soft(String(await n(page, '.client-tasks-feedback')), 'no feedback card without a recap').toBe('0');
  expect.soft(String(await n(page, '.client-tasks-row')), 'three seeded tasks').toBe('3');
  expect.soft(String(await n(page, '.client-tasks-filter')), 'filters rendered').toBe('4');
  expect.soft(String(await txt(page, '.client-tasks-filter')), 'All count').toBe('All (3)');
  const labels = await page.locator('.client-tasks-filter').allInnerTexts();
  expect.soft(String(labels[1].trim()), 'Pending count').toBe('Pending (2)');
  expect.soft(String(labels[2].trim()), 'Overdue count').toBe('Overdue (0)');
  expect.soft(String(labels[3].trim()), 'Completed count').toBe('Completed (1)');
  expect.soft(String(await n(page, '.client-tasks-row-title-done')), 'done task struck through').toBe('1');
  await page.close();

// ===========================================================================
});

test('ClientTasks: filters + toggling', async ({ browser }) => {
  const { page } = await open(browser, { screen: 'clientTasks' });
  await page.locator('.client-tasks-filter').nth(1).click();  // Pending
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-tasks-row')), 'pending filter shows 2').toBe('2');
  await page.locator('.client-tasks-filter').nth(3).click();  // Completed
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-tasks-row')), 'completed filter shows 1').toBe('1');
  await page.locator('.client-tasks-filter').nth(2).click();  // Overdue
  await page.waitForTimeout(250);
  expect.soft(String(await n(page, '.client-tasks-row')), 'overdue filter shows none').toBe('0');
  expect.soft(String(await txt(page, '.client-tasks-empty-title')), 'empty state instead').toBe('All caught up!');

  await page.locator('.client-tasks-filter').first().click();  // All
  await page.waitForTimeout(250);
  await page.locator('.client-tasks-box').nth(1).click();      // tick t2
  await page.waitForTimeout(300);
  const t2 = await store(page, `(m) => m.getTasks('sara').find(t => t.id === 't2').done`);
  expect.soft(String(t2), 'toggle persisted to the store').toBe('true');
  expect.soft(String((await page.locator('.client-tasks-filter').allInnerTexts())[1].trim()), 'counts recomputed').toBe('Pending (1)');
  await page.locator('.client-tasks-box').nth(1).click();      // untick
  await page.waitForTimeout(300);
  expect.soft(String(await store(page, `(m) => m.getTasks('sara').find(t => t.id === 't2').done`)), 'toggle reverses').toBe('false');
  await page.close();

// ===========================================================================
});

test('ClientTasks: mood check-in', async ({ browser }) => {
  const { page } = await open(browser, { screen: 'clientTasks' });
  expect.soft(String(await store(page, `(m) => m.getMood('sara')`)), 'no mood set on a fresh install').toBe('null');
  expect.soft(String(await n(page, '.client-tasks-mood-logged')), 'no confirmation yet').toBe('0');
  expect.soft(String(await n(page, '.client-tasks-mood-btn')), 'five moods offered').toBe('5');
  await page.locator('.client-tasks-mood-btn').nth(1).click();  // good
  await page.waitForTimeout(300);
  expect.soft(String(await store(page, `(m) => m.getMood('sara')`)), 'mood written to the store').toBe('good');
  expect.soft(String(await n(page, '.client-tasks-mood-logged')), 'confirmation appears').toBe('1');
  expect.soft(String(await n(page, '.client-tasks-mood-emoji-on')), 'selected mood highlighted').toBe('1');
  await page.locator('.client-tasks-mood-btn').nth(4).click();  // hard
  await page.waitForTimeout(300);
  expect.soft(String(await store(page, `(m) => m.getMood('sara')`)), 'mood can be changed').toBe('hard');
  expect.soft(String(await n(page, '.client-tasks-mood-emoji-on')), 'still exactly one highlighted').toBe('1');
  await page.reload();
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientTasks'));
  await page.waitForTimeout(500);
  expect.soft(String(await n(page, '.client-tasks-mood-logged')), 'mood survives a reload').toBe('1');
  await page.close();

// ===========================================================================
});

test('ClientTasks: feedback card', async ({ browser }) => {
  const seed = `(m) => m.setRecap('sara', 'sess1', 'You held the routine four days running — keep that.')`;
  const { page } = await open(browser, { screen: 'clientTasks', seed });
  expect.soft(String(await n(page, '.client-tasks-feedback')), 'feedback card shown once a recap exists').toBe('1');
  expect.soft(String(await txt(page, '.client-tasks-feedback-text')), 'feedback text').toBe('You held the routine four days running — keep that.');
  expect.soft(String(await txt(page, '.client-tasks-feedback-date')), 'feedback dated').toBe('Oct 18, 2025');
  // The label is uppercased by CSS, so compare case-insensitively.
  expect.soft(String(/YASMIN/i.test(await txt(page, '.client-tasks-feedback-label'))), 'label names the pro').toBe('true');
  await page.locator('.client-tasks-feedback').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'feedback card opens the pro').toBe('clientCoach');
  await page.close();

// ===========================================================================
});

test('ClientTasks: Arabic RTL + dark', async ({ browser }) => {
  const { page, errs } = await open(browser, { screen: 'clientTasks', lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await page.evaluate(() => document.documentElement.dir)), 'document direction').toBe('rtl');
  expect.soft(String(await txt(page, '.client-tasks-title')), 'title translated').toBe('مهامي');
  expect.soft(String(await txt(page, '.client-tasks-mood-question')), 'mood question translated').toBe('كيف تشعرين اليوم؟');
  expect.soft(String(await txt(page, '.client-tasks-filter')), 'filter label translated').toBe('الكل (3)');
  const raw = await page.evaluate(() => document.querySelector('.client-tasks-scroll').innerText);
  expect.soft(/All \(|Pending \(|Completed \(/.test(raw), 'false');
  await page.close();

// ===========================================================================, 'no raw English filter labels in AR').toBeTruthy()
});

test('Retired stubs', async ({ browser }) => {
  const { page } = await open(browser, { screen: 'clientHome' });
  await page.locator('.bottom-nav-item').nth(3).click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientHome tasks tab → clientTasks').toBe('clientTasks');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientHome'));
  await page.waitForTimeout(300);
  await page.locator('.bottom-nav-item').nth(4).click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientHome schedule tab → clientSchedule').toBe('clientSchedule');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientCoach'));
  await page.waitForTimeout(400);
  await page.locator('.bottom-nav-item').nth(4).click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientCoach schedule tab → clientSchedule').toBe('clientSchedule');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('discover'));
  await page.waitForTimeout(400);
  await page.locator('.bottom-nav-item').nth(3).click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'Discover tasks tab → clientTasks').toBe('clientTasks');
  await page.close();
});
