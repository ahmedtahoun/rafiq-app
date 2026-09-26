import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * A member's next confirmed session.
 *
 * `Client.nextSession` used to be a pre-composed English sentence ("Next:
 * Today, 10:00 AM") sitting in the seed and written by Schedule.tsx's
 * confirmBlock. Same class of bug as Task.due before it:
 *
 *   it rendered in English on every Arabic screen that showed it (Main,
 *   ClientHome, MyCoaches, ClientCoach, ClientProfile, MyPrograms,
 *   ProgramDetail, Clients, ClientSchedule, ClientNotifications);
 *
 *   isSessionToday decided "is this today" by testing the sentence for the
 *   English word "Today," so it depended on nothing ever composing that
 *   sentence in another language — true by luck (Schedule.tsx's confirmBlock
 *   always hardcoded English day names) rather than by construction;
 *
 *   and rescheduleBooking never re-stamped a pro-initiated reschedule of an
 *   already-confirmed session, so the member kept seeing the OLD time
 *   forever after the pro moved it.
 *
 * It is a real epoch ms (`nextSessionAtMs`) now, rendered by
 * format.ts's formatNextSession in whichever language is active. These
 * tests cover the rendering in both languages, that today-detection and
 * which members show up on Main's schedule did not move, and the
 * reschedule staleness fix.
 */

async function open(browser, { screen = 'main', lang = 'en', role = 'coach', params = null, seed = null } = {}) {
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
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);

// ---------------------------------------------------------------------------

test('next sessions read the same in English as the design specified', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'main' });

  const names = (await page.locator('.main-session-name').allInnerTexts()).map((x) => x.trim());
  const nums = (await page.locator('.main-session-time-num').allInnerTexts()).map((x) => x.trim());
  const periods = (await page.locator('.main-session-time-period').allInnerTexts()).map((x) => x.trim());
  // Sara and Omar are both seeded as today's sessions; Mona's is Thursday
  // and does not appear here. Same two exact times the old literal strings
  // held ("Next: Today, 10:00 AM" / "Next: Today, 1:30 PM").
  expect.soft(names, "today's roster is unchanged").toEqual(['Sara Ahmed', 'Omar Fathy']);
  expect.soft(nums, 'the same clock times as the old literal strings').toEqual(['10:00', '1:30']);
  expect.soft(periods, 'AM/PM split out correctly').toEqual(['AM', 'PM']);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientHome and Clients read the same in English as the design specified', async ({ browser }) => {
  const { page: home, ctx: homeCtx } = await open(browser, { screen: 'clientHome', role: 'client' });
  expect.soft((await home.locator('.client-home-card-title').first().innerText()).trim(),
    'sara — same body as "Next: Today, 10:00 AM" once the prefix is stripped').toBe('Today, 10:00 AM');
  await homeCtx.close();

  const { page: roster, ctx: rosterCtx } = await open(browser, { screen: 'clients' });
  const nextTexts = (await roster.locator('.clients-card-next').allInnerTexts()).map((x) => x.trim());
  expect.soft(nextTexts.includes('Next: Today, 10:00 AM'), "sara's row reads exactly as the old literal string did").toBe(true);
  expect.soft(nextTexts.includes('Next: Thu, 10:00 AM'), "mona's row reads exactly as the old literal string did").toBe(true);
  await rosterCtx.close();
});

test('next-session text is in Arabic on an Arabic screen, with no English leaking through', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientHome', role: 'client', lang: 'ar' });

  const title = (await page.locator('.client-home-card-title').first().innerText()).trim();
  expect.soft(/[؀-ۿ]/.test(title), `"${title}" is Arabic`).toBe(true);
  expect.soft(/\bToday\b/.test(title), `"${title}" has no English "Today"`).toBe(false);
  expect.soft(/\d/.test(title), `"${title}" still shows a clock time`).toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('a session confirmed while the Pro is using Arabic still reads correctly in English afterwards', async ({ browser }) => {
  // This is the bug that mattered: the old code built the display string at
  // write time, so whichever language composed it decided every reader's
  // experience forever after. Confirming here happens through the real UI,
  // in Arabic, against a real pending request (the fixed seed/demo blocks
  // have no backing id and confirming them is local-only — a real request,
  // the kind ClientBooking.dc.html's port will eventually create, is what
  // actually persists to nextSessionAtMs).
  const seed = `(m) => m.addCustomBlock({ clientId: 'sara', kind: 'pending', label: 'Sara Ahmed · Requested', dayIndex: 4, startH: 15, endH: 15.75 })`;
  const { page, ctx } = await open(browser, { screen: 'schedule', lang: 'ar', seed });

  await page.locator('.schedule-day-chip').nth(4).click();
  await page.waitForTimeout(250);
  await page.locator('.schedule-block').filter({ hasText: '3:45' }).first().click();
  await page.waitForTimeout(250);
  await page.locator('.schedule-sheet-btn-green').click();
  await page.waitForTimeout(250);

  const sara = await store(page, `(m) => m.getClient('sara')`);
  expect.soft(typeof sara.nextSessionAtMs, 'a real timestamp, not a string in whatever language confirmed it').toBe('number');
  expect.soft(sara.nextSessionAtMs, "stamped to the request's real slot").toBe(await store(page, `(m) => m.msFromDayHour(4, 15)`));

  // Reload in English — a client reading this afterwards is not stuck with
  // the Pro's language, because nothing about the confirming language was
  // ever stored.
  await page.evaluate(() => localStorage.setItem('rafiq_lang', JSON.stringify('en')));
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientHome');
  });
  await page.waitForTimeout(450);
  const title = (await page.locator('.client-home-card-title').first().innerText()).trim();
  expect.soft(/^Fri,/.test(title), `"${title}" reads in English`).toBe(true);
  expect.soft(/[؀-ۿ]/.test(title), `"${title}" has no leftover Arabic`).toBe(false);

  await ctx.close();
});

test('isSessionToday and the Join badge do not depend on which language confirmed the session', async ({ browser }) => {
  for (const lang of ['en', 'ar']) {
    const { page, ctx } = await open(browser, { screen: 'clientHome', role: 'client', lang });
    const isToday = await store(page, `(m) => m.isSessionToday(m.getClient('sara').nextSessionAtMs)`);
    expect.soft(isToday, `sara's seeded session reads as today in ${lang}`).toBe(true);
    // The Join badge only ever shows for a session isSessionToday says is
    // today — this is the one on-screen signal that would have quietly
    // disappeared in Arabic under the old English-only regex.
    expect.soft(await page.locator('.client-home-join-badge').count(), `Join badge shown in ${lang}`).toBe(1);
    await ctx.close();
  }

  // And the reverse: a real, non-today session never shows it, in either
  // language.
  const seed = `(m) => m.updateClient('sara', { nextSessionAtMs: m.TODAY_MS + 86400000 * 3 })`;
  const { page, ctx } = await open(browser, { screen: 'clientHome', role: 'client', seed });
  expect.soft(await page.locator('.client-home-join-badge').count(), 'no Join badge for a session that is not today').toBe(0);
  await ctx.close();
});

test('a pro reschedule updates the time the member actually sees', async ({ browser }) => {
  // Give sara a real, backed booking (not the seeded display-only one) so
  // rescheduleBooking has something to move, then move it as the Pro.
  const seed = `(m) => {
    m.addCustomBlock({ clientId: 'sara', kind: 'booked', label: 'Session · Sara Ahmed', dayIndex: 3, startH: 14, endH: 14.75 });
    m.updateClient('sara', { nextSessionAtMs: m.msFromDayHour(3, 14) });
  }`;
  const { page, ctx } = await open(browser, { screen: 'main', seed });

  const before = await store(page, `(m) => m.getClient('sara').nextSessionAtMs`);
  await store(page, `(m) => {
    const block = m.getCustomBlocks().find((b) => b.clientId === 'sara' && b.kind === 'booked');
    return m.rescheduleBooking('sara', block.id, 4, 16, 16.75, 'pro');
  }`);
  const after = await store(page, `(m) => m.getClient('sara').nextSessionAtMs`);

  // Before this fix, a pro-initiated reschedule of a confirmed session never
  // touched nextSessionAtMs at all — the member kept seeing the old time.
  expect.soft(after === before, 'the displayed time actually moved').toBe(false);
  expect.soft(after, "moved to the new slot's real timestamp").toBe(await store(page, `(m) => m.msFromDayHour(4, 16)`));

  await ctx.close();
});
