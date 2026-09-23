import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { screen = 'myPrograms', lang = 'en', dark = false, seed = null } = {}) {
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

test('Enrollment model', async ({ browser }) => {
  const { page } = await open(browser, {});
  const list = await store(page, `(m) => m.getClientProgramProgressList('sara').map(p => ({ id: p.offeringId, pct: p.pct, total: p.sessionsTotal, done: p.sessionsCompleted, complete: p.isComplete }))`);
  expect.soft(String(list.length), 'two seeded enrollments').toBe('2');
  expect.soft(String(list[0].pct), 'fixed-length program pct').toBe('63');      // 5/8 → 63%
  expect.soft(String(list[0].complete), 'fixed-length not complete').toBe('false');
  expect.soft(String(list[1].pct), 'ongoing offering has null pct').toBe('null');
  expect.soft(String(list[1].total), 'ongoing offering has null total').toBe('null');
  expect.soft(String(await store(page, `(m) => m.getOfferings().length`)), 'a member sees only enrolled offerings, not the catalogue').toBe('6');

  // Progress is its own counter, not derived from session logs.
  await store(page, `(m) => m.logProgramSession('sara', 'off-program')`);
  expect.soft(String(await store(page, `(m) => m.getClientProgramProgress('sara','off-program').sessionsCompleted`)), 'logProgramSession advances the counter').toBe('6');
  expect.soft(String(await store(page, `(m) => m.getClientProgramProgress('sara','off-program').pct`)), 'pct recomputed').toBe('75');

  expect.soft(String(await store(page, `(m) => { m.enrollClient('sara','off-program'); return m.getEnrollments('sara').length; }`)), 'enrolling is idempotent').toBe('2');
  expect.soft(String(await store(page, `(m) => { m.enrollClient('sara','off-workshop'); return m.getEnrollments('sara').length; }`)), 'enrolling in something new adds a row').toBe('3');
  expect.soft(String(await store(page, `(m) => m.getClientProgramProgress('sara','off-nope')`)), 'an unknown offering is not a program').toBe('null');
  await page.close();

// ===========================================================================
});

test('Milestones: the stub is now real', async ({ browser }) => {
{
  const { page } = await open(browser, {});
  expect.soft(String(await store(page, `(m) => m.getUnreviewedMilestones('sara').length`)), 'nothing complete → no milestone').toBe('0');
  // Finish the 8-week program.
  await store(page, `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); return 1; }`);
  expect.soft(String(await store(page, `(m) => m.getUnreviewedMilestones('sara').length`)), 'complete program fires a milestone').toBe('1');
  expect.soft(String(await store(page, `(m) => m.getUnreviewedMilestones('sara')[0].offering.name`)), 'milestone names the offering').toBe('8-Week Transformation Program');
  await store(page, `(m) => m.markMilestoneReviewed('sara','off-program')`);
  expect.soft(String(await store(page, `(m) => m.getUnreviewedMilestones('sara').length`)), 'reviewing clears it').toBe('0');
  expect.soft(String(await store(page, `(m) => m.getMilestoneReviewStatus('sara','off-program')`)), 'review status readable back').toBe('true');

  // ClientHome's milestone card was dead code until now.
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientHome'));
  await page.waitForTimeout(400);

  await page.close();
}
{
  const { page } = await open(browser, { screen: 'clientHome', seed: `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); return 1; }` });
  const cards = await n(page, '[class*="milestone"]');
  expect.soft(String(cards > 0), 'ClientHome renders the milestone prompt once one exists').toBe('true');
  await page.close();
}

// ===========================================================================
});

test('MyPrograms', async ({ browser }) => {
  const { page, errs } = await open(browser, {});
  expect.soft(String(await screenOf(page)), 'screen is myPrograms').toBe('myPrograms');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.my-programs-title')), 'title').toBe('My Programs');
  expect.soft(String(await n(page, '.my-programs-row')), 'two rows').toBe('2');
  expect.soft(String(await txt(page, '.my-programs-name')), 'first row named').toBe('8-Week Transformation Program');
  expect.soft(String(await txt(page, '.my-programs-type')), 'type label translated from the key').toBe('Course/Program');
  expect.soft(String(await txt(page, '.my-programs-pct')), 'fixed-length row shows a percentage').toBe('63%');
  expect.soft(String(await page.locator('.my-programs-bar-fill').first().evaluate((el) => el.style.width)), 'bar width matches').toBe('63%');
  expect.soft(String(await n(page, '.my-programs-ongoing')), 'ongoing row shows a chip, not 0%').toBe('1');
  expect.soft(String(await n(page, '.my-programs-pct')), 'only one row has a percentage').toBe('1');
  expect.soft(String(await n(page, '.my-programs-next')), 'next-session hint on both rows').toBe('2');
  expect.soft(String((await txt(page, '.my-programs-next')).includes('Today, 10:00 AM')), 'hint is the real next session').toBe('true');
  expect.soft(String(await page.locator('.my-programs-icon').allInnerTexts().then((v) => v.join(','))), 'type icons differ').toBe('PR,1:1');
  await page.close();

// ===========================================================================
});

test('MyPrograms: empty state', async ({ browser }) => {
  const { page, errs } = await open(browser, { seed: `(m) => { localStorage.setItem('rafiq_enrollments_sara', '[]'); return 1; }` });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await n(page, '.my-programs-row')), 'no rows').toBe('0');
  expect.soft(String(await txt(page, '.my-programs-empty-title')), 'empty state shown').toBe("You're not enrolled in any programs yet");
  await page.locator('.my-programs-empty-cta').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'empty CTA opens booking').toBe('clientBooking');
  await page.close();

// ===========================================================================
});

test('ProgramDetail: fixed-length program', async ({ browser }) => {
  const { page, errs } = await open(browser, {});
  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await screenOf(page)), 'navigates to programDetail').toBe('programDetail');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await store(page, `(m) => m.getSelectedOfferingId()`)), 'selected offering handed over').toBe('off-program');
  expect.soft(String(await txt(page, '.program-detail-name')), 'hero names the program').toBe('8-Week Transformation Program');
  expect.soft(String(await txt(page, '.program-detail-type')), 'type label').toBe('Course/Program');
  expect.soft(String((await txt(page, '.program-detail-description')).length > 10), 'description shown').toBe('true');
  expect.soft(String(await txt(page, '.program-detail-ring-value')), 'ring percentage').toBe('63%');
  expect.soft(String(await txt(page, '.program-detail-fraction')), 'fraction').toBe('5/8');
  expect.soft(String(await n(page, '.program-detail-complete')), 'not marked complete').toBe('0');
  expect.soft(String(await txt(page, '.program-detail-goal-text')), 'goal from the client record').toBe('Build a consistent morning routine');
  expect.soft(String(await n(page, '.program-detail-link')), 'next-session card links onward').toBe('1');
  expect.soft(String((await txt(page, '.program-detail-link-title')).includes('Today, 10:00 AM')), 'next session shown').toBe('true');
  expect.soft(String(await n(page, '.program-detail-history-row')), 'history has the enrolment row').toBe('1');
  expect.soft(String(await txt(page, '.program-detail-history-label')), 'enrolled label').toBe('Enrolled');
  expect.soft(String(await txt(page, '.program-detail-history-detail')), 'enrolled date formatted').toBe('Sep 17, 2025');

  await page.locator('.program-detail-link').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'next-session card opens the schedule').toBe('clientSchedule');
  await page.close();

// ===========================================================================
});

test('ProgramDetail: ongoing offering', async ({ browser }) => {
  const { page } = await open(browser, {});
  await page.locator('.my-programs-row').nth(1).click();
  await page.waitForTimeout(500);
  expect.soft(String(await txt(page, '.program-detail-name')), 'ongoing program opens').toBe('1:1 Coaching Session');
  expect.soft(String(await n(page, '.program-detail-ring')), 'no progress ring').toBe('0');
  expect.soft(String(await txt(page, '.program-detail-fraction')), 'ongoing label instead').toBe('Ongoing');
  expect.soft(String((await txt(page, '.program-detail-ongoing-body')).includes('no fixed length')), 'and an explanation of why').toBe('true');
  await page.close();

// ===========================================================================
});

test('ProgramDetail: completed program', async ({ browser }) => {
{
  const { page } = await open(browser, { seed: `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); return 1; }` });
  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await txt(page, '.program-detail-ring-value')), '100%').toBe('100%');
  expect.soft(String(await txt(page, '.program-detail-fraction')), 'fraction').toBe('8/8');
  expect.soft(String(await txt(page, '.program-detail-complete')), 'completed badge').toBe('Completed');
  expect.soft(String(await n(page, '.program-detail-history-row')), 'history gains the milestone row').toBe('2');
  const labels = await page.locator('.program-detail-history-label').allInnerTexts();
  expect.soft(String(labels[1].trim()), 'milestone label').toBe('Milestone reached');
  await page.close();
}
{
  const { page } = await open(browser, { seed: `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); m.markMilestoneReviewed('sara','off-program'); return 1; }` });
  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await n(page, '.program-detail-history-row')), 'reviewed adds a third history row').toBe('3');
  const labels = await page.locator('.program-detail-history-label').allInnerTexts();
  expect.soft(String(labels[2].trim()), 'reviewed label').toBe('Reviewed');
  await page.close();
}

// ===========================================================================
});

test('ProgramDetail: no selection / deleted offering', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { screen: 'programDetail' });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.program-detail-missing-title')), 'not-found state').toBe('Program not found');
  await page.locator('.program-detail-missing-cta').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'back CTA returns to the list').toBe('myPrograms');
  await page.close();
}
{
  // Enrolled in an offering the Pro has since deleted.
  const seed = `(m) => { m.setSelectedOfferingId('off-program'); m.deleteOffering('off-program'); return 1; }`;
  const { page, errs } = await open(browser, { screen: 'programDetail', seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.program-detail-missing-title')), 'deleted offering → not found').toBe('Program not found');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('myPrograms'));
  await page.waitForTimeout(400);
  expect.soft(String(await n(page, '.my-programs-row')), 'and it is skipped in the list, not rendered nameless').toBe('1');
  await page.close();
}

// ===========================================================================
});

test('ProgramDetail: no upcoming session', async ({ browser }) => {
  const seed = `(m) => { m.updateClient('sara', { nextSession: 'No upcoming session' }); return 1; }`;
  const { page } = await open(browser, { seed });
  expect.soft(String(await n(page, '.my-programs-next')), 'no next-session hint on the rows').toBe('0');
  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await txt(page, '.program-detail-link-title')), 'book prompt instead').toBe('No upcoming session');
  await page.locator('.program-detail-link').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'book prompt opens booking').toBe('clientBooking');
  expect.soft(String((await txt(page, '.client-booking-offering')).includes('8-Week')), 'booking picked up the program').toBe('true');
  await page.close();

// ===========================================================================
});

test('Arabic RTL + dark', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await page.evaluate(() => document.documentElement.dir)), 'direction').toBe('rtl');
  expect.soft(String(await txt(page, '.my-programs-title')), 'title translated').toBe('برامجي');
  expect.soft(String(await txt(page, '.my-programs-type')), 'type label translated').toBe('دورة/برنامج');
  expect.soft(String(await txt(page, '.my-programs-ongoing')), 'ongoing chip translated').toBe('مستمر');
  const raw = await page.evaluate(() => document.querySelector('.my-programs-scroll').innerText);
  expect.soft(String(/Ongoing|Course\/Program|Next:/.test(raw)), 'no raw English chrome in AR').toBe('false');

  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await txt(page, '.program-detail-fraction')), 'detail translated').toBe('5/8');
  expect.soft(String(await txt(page, '.program-detail-label')), 'progress label translated').toBe('تقدم الجلسات');
  expect.soft(String(await txt(page, '.program-detail-h2')), 'history translated').toBe('سجل البرنامج');
  expect.soft(String(await page.locator('.program-detail-fraction').first().getAttribute('dir')), 'fraction stays LTR under RTL').toBe('ltr');
  await page.close();
}
{
  const { page, errs } = await open(browser, { screen: 'programDetail', lang: 'ar', dark: false,
    seed: `(m) => { m.setSelectedOfferingId('off-1to1'); return 1; }` });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.program-detail-fraction')), 'ongoing detail translated').toBe('مستمر');
  await page.close();
}

// ===========================================================================
});

test('Retired stubs + navigation', async ({ browser }) => {
  const { page } = await open(browser, { screen: 'clientHome' });
  await page.locator('.bottom-nav-item').nth(2).click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientHome programs tab → myPrograms').toBe('myPrograms');

  for (const from of ['clientCoach', 'clientTasks', 'clientSchedule', 'discover']) {
    await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), from);
    await page.waitForTimeout(350);
    await page.locator('.bottom-nav-item').nth(2).click();
    await page.waitForTimeout(400);
    expect.soft(String(await screenOf(page)), `${from} programs tab → myPrograms`).toBe('myPrograms');
  }

  await page.locator('.my-programs-row').first().click();
  await page.waitForTimeout(400);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().back());
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'back from detail → myPrograms').toBe('myPrograms');
  await page.close();
});
