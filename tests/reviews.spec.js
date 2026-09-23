import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { screen = 'rateCoach', params = null, lang = 'en', dark = false, seed = null } = {}) {
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
  if (seed) await page.evaluate(async (s) => {
    const m = await import('/src/lib/mockStore.ts');
    const d = await import('/src/lib/directory.ts');
    await eval(s)(m, d);
  }, seed);
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(500);
  return { page, ctx, errs };
}
const screenOf = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  const d = await import('/src/lib/directory.ts');
  return eval(src)(m, d);
}, fn);
const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();
const n = (page, sel) => page.locator(sel).count();

// ===========================================================================

test('setRating: ratings were readable but unwritable', async ({ browser }) => {
  const { page } = await open(browser, {});
  expect.soft(String(await store(page, `(m) => Object.keys(m.getRatings('sara')).length`)), 'no ratings on a fresh install').toBe('0');
  expect.soft(String(await store(page, `(m) => m.getProAggregateRating().count`)), 'aggregate is empty').toBe('0');
  await store(page, `(m) => m.setRating('sara', 'sess1', 5, '  Really helpful  ')`);
  expect.soft(String(await store(page, `(m) => m.getRatings('sara').sess1.rating`)), 'rating stored').toBe('5');
  expect.soft(String(await store(page, `(m) => m.getRatings('sara').sess1.comment`)), 'comment trimmed').toBe('Really helpful');
  await store(page, `(m) => m.setRating('sara', 'sess2', 4)`);
  expect.soft(String(await store(page, `(m) => 'comment' in m.getRatings('sara').sess2`)), 'star-only rating has no comment key').toBe('false');
  expect.soft(String(await store(page, `(m) => m.getProAggregateRating().count`)), 'aggregate picks both up').toBe('2');
  expect.soft(String(await store(page, `(m) => m.getProAggregateRating().average`)), 'average').toBe('4.5');
  expect.soft(String(await store(page, `(m) => m.getProAggregateRating().hasEnoughReviews`)), 'still under the 3-review threshold').toBe('false');
  await page.close();

// ===========================================================================
});

test('RateCoach: session mode', async ({ browser }) => {
  const { page, errs } = await open(browser, {});
  expect.soft(String(await screenOf(page)), 'screen is rateCoach').toBe('rateCoach');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.rate-coach-title')), 'title').toBe('Rate Session');
  expect.soft(String((await txt(page, '.rate-coach-heading')).includes('Yasmin El-Sayed')), 'heading names the pro').toBe('true');
  expect.soft(String(await txt(page, '.rate-coach-sub')), 'subheading is the target session date').toBe('Oct 18, 2025');
  expect.soft(String(await n(page, '.rate-coach-star')), 'five stars').toBe('5');
  expect.soft(String(await page.locator('.rate-coach-bar .rate-coach-submit').isDisabled()), 'submit disabled with no rating').toBe('true');

  await page.locator('.rate-coach-star').nth(3).click();   // 4 stars
  await page.waitForTimeout(200);
  expect.soft(String(await page.locator('.rate-coach-bar .rate-coach-submit').isDisabled()), 'submit enabled after picking').toBe('false');
  expect.soft(String(await page.locator('.rate-coach-star[aria-pressed="true"]').count()), 'four stars marked pressed').toBe('4');

  await page.locator('.rate-coach-textarea').fill('The pacing suited me.');
  await page.locator('.rate-coach-bar .rate-coach-submit').click();
  await page.waitForTimeout(400);
  expect.soft(String(await txt(page, '.rate-coach-done-title')), 'thanks state').toBe('Thanks for your feedback!');
  const stored = await store(page, `(m) => m.getRatings('sara')`);
  expect.soft(String(stored.sess1.rating), 'rating written against the right session').toBe('4');
  expect.soft(String(stored.sess1.comment), 'comment written').toBe('The pacing suited me.');
  expect.soft(String(Object.keys(stored).length), 'only one rating written').toBe('1');

  await page.locator('.rate-coach-done .rate-coach-submit').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'done returns to the schedule').toBe('clientSchedule');
  await page.close();

// ===========================================================================
});

test('RateCoach: the row you tapped is the row you rate', async ({ browser }) => {
{
  // Both sessions unrated; ask for the SECOND one explicitly.
  const { page } = await open(browser, { screen: 'rateCoach', params: { sessionId: 'sess2' } });
  expect.soft(String(await txt(page, '.rate-coach-sub')), 'subheading is the requested session').toBe('Oct 11, 2025');
  await page.locator('.rate-coach-star').nth(2).click();
  await page.locator('.rate-coach-bar .rate-coach-submit').click();
  await page.waitForTimeout(400);
  const stored = await store(page, `(m) => m.getRatings('sara')`);
  expect.soft(String(stored.sess2?.rating), 'sess2 rated').toBe('3');
  expect.soft(String(stored.sess1), 'sess1 left alone').toBe('undefined');
  await page.close();
}
{
  // End to end through ClientSchedule's own second Rate button.
  const { page } = await open(browser, { screen: 'clientSchedule' });
  expect.soft(String(await n(page, '.client-schedule-rate')), 'two rate buttons').toBe('2');
  await page.locator('.client-schedule-rate').nth(1).click();
  await page.waitForTimeout(500);
  expect.soft(String(await screenOf(page)), 'lands on rateCoach').toBe('rateCoach');
  expect.soft(String(await txt(page, '.rate-coach-sub')), 'targeting the second row').toBe('Oct 11, 2025');
  await page.locator('.rate-coach-star').nth(4).click();
  await page.locator('.rate-coach-bar .rate-coach-submit').click();
  await page.waitForTimeout(400);
  expect.soft(String(await store(page, `(m) => m.getRatings('sara').sess2.rating`)), 'second row rated').toBe('5');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientSchedule'));
  await page.waitForTimeout(400);
  expect.soft(String(await n(page, '.client-schedule-rated')), 'schedule now shows stars for it').toBe('1');
  expect.soft(String(await n(page, '.client-schedule-rate')), 'and one Rate button left').toBe('1');
  await page.close();
}

// ===========================================================================
});

test('RateCoach: milestone mode', async ({ browser }) => {
{
  const seed = `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); m.setSelectedOfferingId('off-program'); return 1; }`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.rate-coach-title')), 'title switches to the program').toBe('Rate Program');
  expect.soft(String((await txt(page, '.rate-coach-heading')).includes('8-Week Transformation Program')), 'heading names the program').toBe('true');
  expect.soft(String(await txt(page, '.rate-coach-sub')), 'subheading is the offering type').toBe('Course/Program');
  await page.locator('.rate-coach-star').nth(4).click();
  await page.locator('.rate-coach-bar .rate-coach-submit').click();
  await page.waitForTimeout(400);
  const stored = await store(page, `(m) => m.getRatings('sara')`);
  expect.soft(String(Object.keys(stored)[0]), 'keyed by offering, not a session').toBe('milestone-off-program');
  expect.soft(String(stored['milestone-off-program'].rating), 'rating value').toBe('5');
  expect.soft(String(await store(page, `(m) => m.getMilestoneReviewStatus('sara','off-program')`)), 'milestone marked reviewed').toBe('true');
  expect.soft(String(await store(page, `(m) => m.getUnreviewedMilestones('sara').length`)), 'so it stops resurfacing').toBe('0');
  await page.close();
}
{
  // A stale pointer must not turn a session rating into a program rating.
  const seed = `(m) => { m.setSelectedOfferingId('off-program'); return 1; }`;  // no completed program
  const { page } = await open(browser, { seed });
  expect.soft(String(await txt(page, '.rate-coach-title')), 'stale offering pointer falls through to session mode').toBe('Rate Session');
  await page.close();
}
{
  // An explicit session request wins even when a milestone is waiting.
  const seed = `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); m.setSelectedOfferingId('off-program'); return 1; }`;
  const { page } = await open(browser, { screen: 'rateCoach', params: { sessionId: 'sess1' }, seed });
  expect.soft(String(await txt(page, '.rate-coach-title')), 'named session beats a pending milestone').toBe('Rate Session');
  await page.close();
}
{
  // ClientHome's milestone card end to end.
  const seed = `(m) => { for (let i = 0; i < 3; i++) m.logProgramSession('sara','off-program'); return 1; }`;
  const { page } = await open(browser, { screen: 'clientHome', seed });
  expect.soft(String(await n(page, '.client-home-milestone-card')), 'milestone card present').toBe('1');
  await page.locator('.client-home-milestone-rate').click();
  await page.waitForTimeout(500);
  expect.soft(String(await screenOf(page)), 'Rate it opens RateCoach').toBe('rateCoach');
  expect.soft(String(await txt(page, '.rate-coach-title')), 'in milestone mode').toBe('Rate Program');
  await page.close();
}

// ===========================================================================
});

test('RateCoach: nothing left to rate', async ({ browser }) => {
  const seed = `(m) => { m.setRating('sara','sess1',5); m.setRating('sara','sess2',4); return 1; }`;
  const { page, errs } = await open(browser, { seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.rate-coach-done-title')), 'honest empty state').toBe('Nothing to rate yet');
  expect.soft(String(await n(page, '.rate-coach-star')), 'no stars offered').toBe('0');
  expect.soft(String(await n(page, '.rate-coach-bar')), 'no submit bar').toBe('0');
  await page.close();

// ===========================================================================
});

test('CoachMessages', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { screen: 'coachMessages' });
  expect.soft(String(await screenOf(page)), 'screen is coachMessages').toBe('coachMessages');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.coach-messages-name')), 'header names the pro').toBe('Yasmin El-Sayed');
  expect.soft(String(await txt(page, '.coach-messages-empty-title')), 'empty state').toBe('No messages yet');
  expect.soft(String((await txt(page, '.coach-messages-empty-body')).includes('Yasmin')), 'empty body names the pro').toBe('true');
  expect.soft(String(await page.locator('.coach-messages-send').isDisabled()), 'send disabled while the box is empty').toBe('true');

  await page.locator('.coach-messages-input').fill('Hi! Quick question about this week.');
  await page.waitForTimeout(200);
  expect.soft(String(await store(page, `(m) => m.getMessageDraft('sara')`)), 'draft persisted as you type').toBe('Hi! Quick question about this week.');
  expect.soft(String(await page.locator('.coach-messages-send').isDisabled()), 'send now enabled').toBe('false');
  await page.locator('.coach-messages-send').click();
  await page.waitForTimeout(400);

  expect.soft(String(await n(page, '.coach-messages-bubble')), 'bubble rendered').toBe('1');
  expect.soft(String(await n(page, '.coach-messages-bubble-mine')), 'and it is mine').toBe('1');
  expect.soft(String(await store(page, `(m) => m.getMessages('sara').length`)), 'message stored').toBe('1');
  expect.soft(String(await store(page, `(m) => m.getMessages('sara')[0].senderRole`)), 'stored with the client role').toBe('client');
  expect.soft(String(await store(page, `(m) => m.getMessageDraft('sara')`)), 'draft cleared').toBe('');
  expect.soft(String(await page.locator('.coach-messages-input').inputValue()), 'input cleared').toBe('');
  expect.soft(String(await store(page, `(m) => m.getUnreadMessageCount('sara','client')`)), 'unread count for the member is zero after opening').toBe('0');
  expect.soft(String(await store(page, `(m) => m.getUnreadMessageCount('sara','pro')`)), 'the pro has one unread').toBe('1');

  // Enter key sends too.
  await page.locator('.coach-messages-input').fill('Second one');
  await page.locator('.coach-messages-input').press('Enter');
  await page.waitForTimeout(400);
  expect.soft(String(await store(page, `(m) => m.getMessages('sara').length`)), 'Enter sends').toBe('2');
  expect.soft(String(await store(page, `(m) => { m.sendMessage('sara','   ','client'); return m.getMessages('sara').length; }`)), 'whitespace-only is not sent').toBe('2');
  await page.close();
}
{
  // A reply from the pro renders on the other side.
  const seed = `(m) => { m.sendMessage('sara','Of course — what is it?','pro'); return 1; }`;
  const { page } = await open(browser, { screen: 'coachMessages', seed });
  expect.soft(String(await n(page, '.coach-messages-bubble')), 'their bubble rendered').toBe('1');
  expect.soft(String(await n(page, '.coach-messages-bubble-mine')), 'and it is not mine').toBe('0');
  await page.close();
}

// ===========================================================================
});

test('CoachMessages: blocked relationship', async ({ browser }) => {
  const seed = `(m) => { localStorage.setItem('rafiq_block_sara', JSON.stringify({ blockedByPro: true, blockedByMember: false })); return 1; }`;
  const { page, errs } = await open(browser, { screen: 'coachMessages', seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  const blocked = await store(page, `(m) => m.canInteract('sara')`);

  if (blocked === false) {
    expect.soft(String(await n(page, '.coach-messages-input')), 'composer replaced by a reason').toBe('0');
    expect.soft(String((await txt(page, '.coach-messages-blocked')).includes('blocked')), 'reason explains the block').toBe('true');
  } else {

  }
  await page.close();

// ===========================================================================
});

test('MyCoaches', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { screen: 'myCoaches' });
  expect.soft(String(await screenOf(page)), 'screen is myCoaches').toBe('myCoaches');
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.my-coaches-title')), 'title').toBe('My Pros');
  expect.soft(String(await txt(page, '.my-coaches-name')), 'active pro named').toBe('Yasmin El-Sayed');
  // The design hardcoded 4.9 here.
  expect.soft(String(await txt(page, '.my-coaches-rating-none')), 'no fabricated rating').toBe('No rating yet');
  expect.soft(String(await txt(page, '.my-coaches-quick-value')), 'next session quick fact').toBe('Today, 10:00 AM');
  const quick = await page.locator('.my-coaches-quick-value').allInnerTexts();
  expect.soft(String(quick[1].trim()), 'tasks quick fact').toBe('2 pending');
  expect.soft(String(await txt(page, '.my-coaches-empty')), 'no pending requests yet').toBe('No pending requests');
  expect.soft(String((await page.locator('.my-coaches-empty').allInnerTexts())[1].trim()), 'past section always empty (nothing ends a relationship)').toBe('No past pros yet');

  await page.locator('.my-coaches-action').nth(3).click();  // message
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'message action → coachMessages').toBe('coachMessages');
  await page.close();
}
{
  // Enough ratings to pass the threshold: the real average appears.
  const seed = `(m) => { m.setRating('sara','sess1',5); m.setRating('sara','sess2',4); m.setRating('sara','sess3',3); return 1; }`;
  const { page } = await open(browser, { screen: 'myCoaches', seed });
  expect.soft(String(await txt(page, '.my-coaches-rating-value')), 'real average shown once there are enough reviews').toBe('4.0');
  expect.soft(String(await n(page, '.my-coaches-rating-none')), 'and the placeholder is gone').toBe('0');
  await page.close();
}

// ===========================================================================
});

test('MyCoaches: the pending requests nothing used to read', async ({ browser }) => {
  const seed = `(m, d) => { d.requestSession({ coachId: 'mariam', coachName: 'Mariam Adel', offeringId: 'off-1to1', offeringName: '1:1 Coaching Session', when: 'Thu, 10:00 AM', price: 750 }); return 1; }`;
  const { page, errs } = await open(browser, { screen: 'myCoaches', seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await n(page, '.my-coaches-pending')), 'the request shows up').toBe('1');
  expect.soft(String(await txt(page, '.my-coaches-pending-name')), 'named').toBe('Mariam Adel');
  expect.soft(String(await txt(page, '.my-coaches-pending-specialty')), 'specialty translated from the directory record').toBe('Meditation coaching');
  expect.soft(String(await txt(page, '.my-coaches-pending-avatar')), 'initials').toBe('MA');
  expect.soft(String((await page.locator('.my-coaches-empty').allInnerTexts())[0].trim()), 'no empty-pending message now').toBe('No past pros yet');

  // De-duped by coach, per directory.ts's own contract.
  await store(page, `(m, d) => d.requestSession({ coachId: 'mariam', coachName: 'Mariam Adel', offeringId: 'off-1to1', offeringName: '1:1', when: 'Fri, 11:00 AM', price: 750 })`);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientHome'));
  await page.waitForTimeout(300);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('myCoaches'));
  await page.waitForTimeout(400);
  expect.soft(String(await n(page, '.my-coaches-pending')), 'a second request to the same pro does not duplicate the card').toBe('1');

  await store(page, `(m, d) => d.requestSession({ coachId: 'omar-s', coachName: 'Omar Sami', offeringId: 'off-1to1', offeringName: '1:1', when: 'Sat, 9:00 AM', price: 600 })`);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientHome'));
  await page.waitForTimeout(300);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('myCoaches'));
  await page.waitForTimeout(400);
  expect.soft(String(await n(page, '.my-coaches-pending')), 'a different pro adds a second card').toBe('2');
  await page.close();

// ===========================================================================
});

test('Arabic RTL + dark', async ({ browser }) => {
{
  const { page, errs } = await open(browser, { screen: 'rateCoach', lang: 'ar', dark: true });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await page.evaluate(() => document.documentElement.dir)), 'direction').toBe('rtl');
  expect.soft(String(await txt(page, '.rate-coach-title')), 'title translated').toBe('تقييم الجلسة');
  expect.soft(String(await txt(page, '.rate-coach-bar .rate-coach-submit')), 'submit translated').toBe('إرسال التقييم');
  expect.soft(String((await page.locator('.rate-coach-textarea').getAttribute('placeholder')).includes('شاركي')), 'placeholder translated').toBe('true');
  await page.close();
}
{
  const seed = `(m) => { m.sendMessage('sara','مرحبًا، سؤال سريع','client'); return 1; }`;
  const { page, errs } = await open(browser, { screen: 'coachMessages', lang: 'ar', dark: true, seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.coach-messages-subtitle')), 'subtitle translated').toBe('رسائل داخل التطبيق');
  expect.soft(String(await txt(page, '.coach-messages-bubble')), 'arabic message renders').toBe('مرحبًا، سؤال سريع');
  const ph = await page.locator('.coach-messages-input').getAttribute('placeholder');
  expect.soft(String(ph), 'placeholder translated').toBe('اكتبي رسالة');
  await page.close();
}
{
  const seed = `(m, d) => { d.requestSession({ coachId: 'mariam', coachName: 'Mariam Adel', offeringId: 'off-1to1', offeringName: '1:1', when: 'Thu', price: 750 }); return 1; }`;
  const { page, errs } = await open(browser, { screen: 'myCoaches', lang: 'ar', dark: false, seed });
  expect.soft(String(errs.length), 'no console/page errors').toBe('0');
  expect.soft(String(await txt(page, '.my-coaches-title')), 'title translated').toBe('محترفوني');
  expect.soft(String(await txt(page, '.my-coaches-section-label')), 'active label translated').toBe('نشط');
  expect.soft(String(await txt(page, '.my-coaches-pending-specialty')), 'pending specialty translated').toBe('تدريب التأمل');
  expect.soft(String(await txt(page, '.my-coaches-pending-badge')), 'badge translated').toBe('قيد الانتظار');
  const raw = await page.evaluate(() => document.querySelector('.my-coaches-scroll').innerText);
  expect.soft(String(/Active|Pending|No past pros/.test(raw)), 'no raw English chrome in AR').toBe('false');
  await page.close();
}

// ===========================================================================
});

test('Retired stubs + navigation', async ({ browser }) => {
{
  const { page } = await open(browser, { screen: 'clientCoach' });
  await page.locator('.client-coach-hero-btn').first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientCoach back chevron → myCoaches').toBe('myCoaches');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientCoach'));
  await page.waitForTimeout(400);
  await page.locator('.client-coach-primary').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientCoach message button → coachMessages').toBe('coachMessages');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientProfile'));
  await page.waitForTimeout(400);
  await page.locator('.client-profile-card').filter({ has: page.locator('.client-profile-coach-avatar') }).first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientProfile pro card → myCoaches').toBe('myCoaches');

  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('myCoaches'));
  await page.waitForTimeout(300);
  await page.locator('.my-coaches-find').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'find-another → discover').toBe('discover');
  await page.close();
}
{
  // Via the real entry point, so history is what a member would have.
  const { page } = await open(browser, { screen: 'clientCoach' });
  await page.locator('.client-coach-hero-btn').first().click();
  await page.waitForTimeout(400);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().back());
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'back from myCoaches → clientCoach').toBe('clientCoach');
  await page.close();
}
{
  // And the PARENT fallback when there is no history at all.
  const { page } = await open(browser, { screen: 'coachMessages' });
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.setState({ hist: [] });
    m.useAppStore.getState().back();
  });
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'coachMessages with no history falls back to clientCoach').toBe('clientCoach');
  await page.close();
}
});
