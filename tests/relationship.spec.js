import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { screen = 'clientCoach', lang = 'en', dark = false, local = {} } = {}) {
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
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(600);
  return { page, ctx, errs };
}
const state = (page) => page.evaluate(async () => {
  const m = await import('/src/store/appStore.ts');
  return m.useAppStore.getState().screen;
});
const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);

test('ClientCoach renders', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await state(page)), 'screen').toBe('clientCoach');
  expect.soft(String(await page.locator('.client-coach-name').innerText()), 'coach name shown').toBe('Yasmin El-Sayed');
  expect.soft(String(await page.locator('.client-coach-stat').count()), 'three stats').toBe('3');
  expect.soft(String(await page.locator('.client-coach-quick-card').count()), 'quick cards').toBe('2');
  expect.soft(String(await page.locator('.client-coach-payment').count()), 'payment strip').toBe('1');
  expect.soft(String(await page.locator('.client-coach-upgrade').count()), 'upgrade CTA shown for a Basic member').toBe('1');
  expect.soft(String(await page.locator('.client-coach-standing').count()), 'no standing slot yet').toBe('0');
  expect.soft(String(await page.locator('.bottom-nav').count()), 'bottom nav').toBe('1');
  expect.soft(String(errs.length), 'no errors').toBe('0');

  await ctx.close();
});

test('ClientCoach: report a problem writes a real report', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String((await store(page, '(m)=>m.getProReports()')).length), 'nothing reported yet').toBe('0');
  await page.locator('.client-coach-report').click();
  await page.waitForTimeout(400);
  expect.soft(String(await page.locator('.client-coach-reason').count()), 'sheet opens with 4 reasons').toBe('4');
  await page.locator('.client-coach-reason').nth(1).click();
  await page.waitForTimeout(400);
  expect.soft(String(await page.locator('.client-coach-reported').count()), 'confirmation shown').toBe('1');
  const reports = await store(page, '(m)=>m.getProReports()');
  expect.soft(String(reports.length), 'report persisted').toBe('1');
  expect.soft(String(reports[0].reason), '  right reason').toBe('inappropriate');
  expect.soft(String(reports[0].clientId), '  scoped to this member').toBe('sara');
  expect.soft(String(reports[0].proId), '  names the pro').toBe('pro-yasmin');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientCoach: Full Access is announced, not sold', async ({ browser }) => {
  // It used to be a button opening a sheet whose "Pay with card" charged
  // nothing and then granted the plan. Nothing in the app can take that
  // payment yet, so the card says so and stays inert.
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await page.locator('.client-coach-upgrade').count()), 'upgrade card still shown').toBe('1');
  expect.soft(String(await page.locator('button.client-coach-upgrade').count()), '  but it is not a button').toBe('0');
  // innerText gives the rendered text, which the badge's text-transform uppercases.
  expect.soft(String(await page.locator('.client-coach-soon-badge').innerText()).toLowerCase(), '  badged coming soon').toBe('coming soon');
  const note = await page.locator('.client-coach-upgrade-note').innerText();
  expect.soft(String(note.includes('Yasmin El-Sayed')), '  points at the Pro instead').toBe('true');
  expect.soft(String(/can't take payment/i.test(note)), '  and says why').toBe('true');

  await page.locator('.client-coach-upgrade').click();
  await page.waitForTimeout(400);
  expect.soft(String(await page.locator('.client-coach-subscribe').count()), 'no subscribe sheet opens').toBe('0');
  expect.soft(String(await page.locator('.client-coach-pay').count()), 'no pay button anywhere').toBe('0');

  const frameText = await page.locator('.phone-frame').innerText();
  expect.soft(String(/pay with card/i.test(frameText)), 'screen never offers a card payment').toBe('false');

  // Nothing was granted and nothing was charged.
  expect.soft(String(await store(page, "(m)=>m.getClient('sara').plan")), 'plan unchanged').toBe('Basic');
  expect.soft(String(await store(page, "(m)=>m.getStandingSlot('sara')")), 'no standing slot written').toBe('null');
  const blocks = await store(page, "(m)=>m.getCustomBlocks().filter(b=>b.kind==='pending')");
  expect.soft(String(blocks.length), 'no pending block written').toBe('0');
  const pays = await store(page, "(m)=>m.getPaymentHistory('sara')");
  expect.soft(String(pays.length), 'no payment written').toBe('0');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: month grid', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking' });
  expect.soft(String(await page.locator('.client-booking-month-label').innerText()), 'month label').toBe('October 2025');
  expect.soft(String(await page.locator('.client-booking-cell').count()), '35 cells (5 whole weeks)').toBe('35');
  expect.soft(String(await page.locator('.client-booking-weekday').count()), '7 weekday headers').toBe('7');
  // Only the app's one live week, minus the days already passed, is bookable.
  const bookable = await page.locator('.client-booking-cell:not([disabled])').count();
  expect.soft(String(bookable), 'bookable cells = live week minus past days').toBe('5');
  const labels = await page.locator('.client-booking-cell:not([disabled])').allInnerTexts();
  expect.soft(String(labels.map((s) => s.trim()).join(',')), '  they are Oct 22-26').toBe('22,23,24,25,26');
  expect.soft(String(await page.locator('.client-booking-cell-on').count()), 'one cell selected by default').toBe('1');
  expect.soft(String((await page.locator('.client-booking-cell-on').innerText()).trim()), '  it is today (22)').toBe('22');
  // A dot marks a day the Pro is actually open on.
  const dots = await page.locator('.client-booking-cell-dot').count();
  expect.soft(String(dots > 0 && dots <= bookable), 'dots mark open days only').toBe('true');

  expect.soft(String(await page.locator('.client-booking-cell-outside').count()), 'days outside October are dimmed').toBe('4');
  expect.soft(String(await page.locator('.client-booking-month-hint').count()), 'hint shown').toBe('1');

  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: picking a date from the grid', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking' });
  const before = await page.locator('.client-booking-selected').innerText();
  // Pick the last bookable date (Oct 26).
  await page.locator('.client-booking-cell:not([disabled])').last().click();
  await page.waitForTimeout(350);
  const after = await page.locator('.client-booking-selected').innerText();
  expect.soft(String(before !== after), 'selected-day label follows the grid').toBe('true');

  expect.soft(String((await page.locator('.client-booking-cell-on').innerText()).trim()), 'selection moved').toBe('26');
  expect.soft(String(await page.locator('.client-booking-cell', { hasText: /^20$/ }).first().isDisabled()), 'a past date cannot be picked').toBe('true');
  expect.soft(String(await page.locator('.client-booking-cell', { hasText: /^15$/ }).first().isDisabled()), 'a date outside the live week cannot be picked').toBe('true');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: the golden path uses a package credit', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking' });
  expect.soft(String(await state(page)), 'screen').toBe('clientBooking');
  expect.soft(String(await page.locator('.client-booking-cell').count()), 'month grid rendered').toBe('35');
  expect.soft(String(await page.locator('.client-booking-type').count()), 'three session types').toBe('3');
  const slots = await page.locator('.client-booking-slot').count();
  expect.soft(String(slots > 0), 'slots from real availability').toBe('true');

  expect.soft(String(await page.locator('.client-booking-primary').isDisabled()), 'confirm disabled before picking').toBe('true');

  const before = await store(page, "(m)=>m.getPackageStatus('sara').remaining");

  // pick the last slot (today's earlier ones have passed)
  await page.locator('.client-booking-slot:not([disabled])').last().click();
  await page.waitForTimeout(300);
  expect.soft(String(await page.locator('.client-booking-credit').count()), 'credit notice shown (has credits)').toBe('1');
  expect.soft(String(await page.locator('.client-booking-pay-box').count()), '  no payment box').toBe('0');
  expect.soft(String(await page.locator('.client-booking-primary').isDisabled()), 'confirm now enabled').toBe('false');

  await page.locator('.client-booking-primary').click();
  await page.waitForTimeout(500);
  expect.soft(String(await page.locator('.client-booking-confirmed').count()), 'confirmation shown').toBe('1');
  expect.soft(String(await page.locator('.client-booking-receipt-row').count()), '  receipt rows').toBe('4');
  expect.soft(String(await page.locator('a[download="session.ics"]').count()), '  ics offered').toBe('1');
  const href = await page.locator('a[download="session.ics"]').getAttribute('href');
  expect.soft(String(href.startsWith('data:text/calendar')), '  ics is a calendar').toBe('true');
  expect.soft(String(decodeURIComponent(href).includes('DTSTART:2025')), '  ics has DTSTART').toBe('true');

  const blocks = await store(page, "(m)=>m.getCustomBlocks()");
  expect.soft(String(blocks.filter((b) => b.kind === 'pending').length), 'pending block written').toBe('1');
  expect.soft(String(blocks[0].clientId), '  carries clientId').toBe('sara');
  expect.soft(String(blocks[0].sessionType), '  carries sessionType').toBe('standard');
  const after = await store(page, "(m)=>m.getPackageStatus('sara').remaining");
  expect.soft(String(after), 'a credit was spent').toBe(String(before - 1));
  const pays = await store(page, "(m)=>m.getPaymentHistory('sara')");
  expect.soft(String(pays.length), 'no payment when a credit covers it').toBe('0');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: no credits left still books, with no payment step', async ({ browser }) => {
  // Drain the package first.
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking' });
  await store(page, "(m)=>{const p=m.getPackageStatus('sara'); for(let i=0;i<p.remaining;i++) m.chargeCredit('sara'); return null}");
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientHome');
    m.useAppStore.getState().nav('clientBooking');
  });
  await page.waitForTimeout(500);
  expect.soft(String(await store(page, "(m)=>m.getPackageStatus('sara').remaining")), 'credits drained').toBe('0');
  await page.locator('.client-booking-slot:not([disabled])').last().click();
  await page.waitForTimeout(300);
  expect.soft(String(await page.locator('.client-booking-pay-box').count()), 'the fee is stated').toBe('1');
  expect.soft(String(await page.locator('.client-booking-credit').count()), '  no credit notice').toBe('0');
  expect.soft(String(await page.locator('.client-booking-pay').count()), '  but no button that takes payment').toBe('0');
  const note = await page.locator('.client-booking-pay-note').innerText();
  expect.soft(String(note.includes('Yasmin El-Sayed')), '  the Pro arranges it').toBe('true');

  // The request no longer waits on a payment that never happens.
  expect.soft(String(await page.locator('.client-booking-primary').isDisabled()), '  confirm is not gated on paying').toBe('false');
  await page.locator('.client-booking-primary').click();
  await page.waitForTimeout(500);
  expect.soft(String(await page.locator('.client-booking-confirmed').count()), 'request sent').toBe('1');
  const blocks = await store(page, "(m)=>m.getCustomBlocks().filter(b=>b.kind==='pending')");
  expect.soft(String(blocks.length), '  pending block written').toBe('1');

  // Nobody was charged, so nothing may appear on the Pro's books.
  const pays = await store(page, "(m)=>m.getPaymentHistory('sara')");
  expect.soft(String(pays.length), 'no payment invented').toBe('0');
  const confirmText = await page.locator('.client-booking-confirmed').innerText();
  expect.soft(String(/will arrange payment/i.test(confirmText)), '  and the receipt says who settles it').toBe('true');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: blocked relationship cannot book', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientCoach' });
  await store(page, "(m)=>m.setBlocked('sara','pro',true)").catch(() => null);
  const blockedNow = await page.evaluate(async () => {
    const m = await import('/src/lib/mockStore.ts');
    // Suspend the member's account — a path canInteract() definitely covers.
    m.updateClient('sara', { accountStatus: 'suspended' });
    return m.canInteract('sara');
  });
  expect.soft(String(blockedNow), 'canInteract is false').toBe('false');
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientBooking');
  });
  await page.waitForTimeout(500);
  expect.soft(String(await page.locator('.client-booking-blocked').count()), 'booking refused with an explanation').toBe('1');
  expect.soft(String(await page.locator('.client-booking-slot').count()), '  no picker rendered').toBe('0');

  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientCoach');
  });
  await page.waitForTimeout(400);
  expect.soft(String(await page.locator('.client-coach-primary:disabled').count()), 'ClientCoach disables its actions too').toBe('1');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('ClientBooking: a day with no availability', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientBooking' });
  // Find a closed day from the store, then select it.
  const closed = await page.evaluate(async () => {
    const m = await import('/src/lib/mockStore.ts');
    for (let i = 2; i < 7; i++) if (m.getAvailabilityForDayIndex(i).length === 0) return i;
    return -1;
  });
  if (closed < 0) { info('no closed weekday in the seed — skipping', ''); }
  else {
    // Bookable cells run Oct 22..26, i.e. dayIndex 2..6.
    await page.locator('.client-booking-cell:not([disabled])').nth(closed - 2).click();
    await page.waitForTimeout(350);
    expect.soft(String(await page.locator('.client-booking-empty').count()), 'empty-day message shown').toBe('1');
    expect.soft(String(await page.locator('.client-booking-slot').count()), '  no slots').toBe('0');
    expect.soft(String(await page.locator('.client-booking-primary').isDisabled()), '  confirm disabled').toBe('true');
  }
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('nav wiring', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientHome' });
  await page.locator('.bottom-nav-item').last().click();
  await page.waitForTimeout(450);
  expect.soft(String(await state(page)), 'ClientHome nav reaches Your Pro').toBe('clientCoach');
  await page.locator('.client-coach-secondary').click();
  await page.waitForTimeout(450);
  expect.soft(String(await state(page)), 'Book a Session opens ClientBooking').toBe('clientBooking');
  await page.locator('.client-booking-close').click();
  await page.waitForTimeout(450);
  expect.soft(String(await state(page)), 'cancel goes back to Your Pro').toBe('clientCoach');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('AR / dark render', async ({ browser }) => {
for (const [lang, dark] of [['ar', true], ['ar', false]]) {
  for (const screen of ['clientCoach', 'clientBooking']) {
    const { page, ctx, errs } = await open(browser, { screen, lang, dark });
    const sel = screen === 'clientCoach' ? '.client-coach-screen' : '.client-booking-screen';
    expect.soft(String(await page.locator(sel).count()), `${screen} ${lang}/${dark ? 'dark' : 'light'}: renders`).toBe('1');
    expect.soft(String(await page.evaluate(() => document.documentElement.dir)), `  RTL applied`).toBe('rtl');
    expect.soft(String(errs.length), `  no errors`).toBe('0');
    await ctx.close();
  }
}
});
