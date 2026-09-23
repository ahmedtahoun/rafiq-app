import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The Pro's calendar: Schedule, Availability, AddTimeBlock.
 *
 * All of this hangs off the fixed fictional week (Wed 22 Oct 2025), so the
 * assertions are about the relationships between the pieces — the month
 * grid against the one the store derives, a tapped cell against the day it
 * opens — rather than against dates typed into the test, which would just
 * restate the same literal the screen already has.
 */

async function open(browser, { screen = 'schedule', lang = 'en', dark = false, seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  }, [lang, dark]);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);
const n = (page, sel) => page.locator(sel).count();
const view = (page, name) => page.locator('.schedule-view-tab', { hasText: new RegExp(`^${name}$`, 'i') }).first();

// ---------------------------------------------------------------------------

test('Schedule: the month grid agrees with the one the store derives', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  await view(page, 'Month').click();
  await page.waitForTimeout(350);

  const rendered = await page.locator('.schedule-month-cell').evaluateAll((els) =>
    els.map((el) => ({
      day: Number(el.querySelector('span')?.textContent ?? ''),
      // Out-of-month cells are dimmed rather than marked, so read the style
      // the screen actually applies.
      inMonth: el.style.opacity === '1',
    })),
  );
  const derived = await store(page, `(m) => m.getMonthGrid().map(c => ({ day: c.day, inMonth: c.inMonth }))`);

  // Schedule still carries a hand-written month literal while the store
  // derives the same grid from the fixed week. mockStore's own comment says
  // Schedule should move onto getMonthGrid(); until it does, this is what
  // stops the two drifting apart unnoticed.
  expect.soft(rendered.length, 'same number of cells as the derived grid').toBe(derived.length);
  expect.soft(rendered.map((c) => c.day), 'same day numbers, in the same order')
    .toEqual(derived.map((c) => c.day));
  expect.soft(rendered.map((c) => c.inMonth), 'same cells belong to the month')
    .toEqual(derived.map((c) => c.inMonth));

  // The grid runs in whole Monday-start weeks, so it is always rectangular.
  expect.soft(rendered.length % 7, 'grid is whole weeks').toBe(0);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Schedule: the live week is exactly the seven days the store marks', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await view(page, 'Month').click();
  await page.waitForTimeout(350);

  // Cells in the fixed week are the tappable ones; the screen weights them
  // at 700 and leaves the rest unclickable.
  const bold = await page.locator('.schedule-month-cell').evaluateAll((els) =>
    els.map((el, i) => ({ i, day: Number(el.querySelector('span')?.textContent ?? ''), live: el.style.fontWeight === '700' }))
      .filter((c) => c.live),
  );
  const derivedLive = await store(page, `(m) => m.getMonthGrid().map((c, i) => ({ i, day: c.day, idx: c.dayIndex })).filter(c => c.idx !== null)`);

  expect.soft(bold.length, 'seven live days').toBe(7);
  expect.soft(bold.map((c) => c.day), 'the live days match the store').toEqual(derivedLive.map((c) => c.day));

  await ctx.close();
});

test('Schedule: tapping a month cell opens that day', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await view(page, 'Month').click();
  await page.waitForTimeout(350);

  const live = await page.locator('.schedule-month-cell').evaluateAll((els) =>
    els.map((el, i) => ({ i, day: el.querySelector('span')?.textContent, live: el.style.fontWeight === '700' }))
      .filter((c) => c.live),
  );
  // Pick the fourth live day (Thursday) so it is not the already-selected one.
  const target = live[3];
  await page.locator('.schedule-month-cell').nth(target.i).click();
  await page.waitForTimeout(350);

  expect.soft(await n(page, '.schedule-month-grid'), 'switched away from the month view').toBe(0);
  const selected = await page.locator('.schedule-day-chip.is-selected .schedule-day-chip-date').innerText();
  expect.soft(selected.trim(), 'the day it opened is the day that was tapped').toBe(target.day);

  await ctx.close();
});

test('Schedule: the three views are mutually exclusive', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  for (const [name, marker] of [['Day', '.schedule-day-chip'], ['Week', '.schedule-week-dow-full'], ['Month', '.schedule-month-grid']]) {
    await view(page, name).click();
    await page.waitForTimeout(300);
    expect.soft(await n(page, marker) > 0, `${name} view renders its own layout`).toBe(true);
    expect.soft(await n(page, '.schedule-view-tab.is-active'), `${name}: exactly one active tab`).toBe(1);
  }

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Schedule: each day shows its own blocks, and returning restores them', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  const readDay = async (i) => {
    await page.locator('.schedule-day-chip').nth(i).click();
    await page.waitForTimeout(350);
    return {
      count: await n(page, '.schedule-block'),
      first: (await n(page, '.schedule-block')) ? await page.locator('.schedule-block').first().innerText() : '',
    };
  };

  const tuesday = await readDay(1);
  const friday = await readDay(4);

  expect.soft(tuesday.count > 0, 'Tuesday has blocks').toBe(true);
  expect.soft(friday.count > 0, 'Friday has blocks').toBe(true);
  // Tuesday carries bookings, Friday an all-day unavailable block. If the day
  // chips ever stop driving the list, these collapse to the same thing.
  expect.soft(friday.first === tuesday.first, 'different days show different blocks').toBe(false);

  const backToTuesday = await readDay(1);
  expect.soft(backToTuesday.first, 'returning to a day restores its blocks').toBe(tuesday.first);
  expect.soft(backToTuesday.count, 'and the same number of them').toBe(tuesday.count);

  await ctx.close();
});

test('Availability: toggling a day writes through and survives a revisit', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'availability' });

  const before = await store(page, `(m) => m.getWeeklyAvailability().map(d => d.enabled)`);
  expect.soft(before.length, 'seven days').toBe(7);

  await page.locator('.availability-switch').first().click();
  await page.waitForTimeout(300);

  const after = await store(page, `(m) => m.getWeeklyAvailability().map(d => d.enabled)`);
  expect.soft(after[0], 'the first day flipped').toBe(!before[0]);
  expect.soft(after.slice(1), 'no other day changed').toEqual(before.slice(1));

  // The switch reports its state to assistive tech, not just visually.
  const checked = await page.locator('.availability-switch').first().getAttribute('aria-checked');
  expect.soft(checked, 'aria-checked matches the stored state').toBe(String(after[0]));

  // Leave and come back: the change is persisted, not component state.
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('schedule');
  });
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('availability');
  });
  await page.waitForTimeout(350);
  const revisited = await store(page, `(m) => m.getWeeklyAvailability().map(d => d.enabled)`);
  expect.soft(revisited, 'still the toggled state after leaving and returning').toEqual(after);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('AddTimeBlock: refuses an incomplete or backwards range', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'addTimeBlock' });
  const submit = page.locator('.add-time-block-submit');

  expect.soft(await submit.isDisabled(), 'disabled with no times at all').toBe(true);

  await page.locator('#atb-start').fill('10am');
  await page.waitForTimeout(150);
  expect.soft(await submit.isDisabled(), 'still disabled with only a start').toBe(true);

  // End before start is not a block, it is a typo.
  await page.locator('#atb-end').fill('9am');
  await page.waitForTimeout(150);
  expect.soft(await submit.isDisabled(), 'disabled when the end precedes the start').toBe(true);

  // Equal start and end is a zero-length block.
  await page.locator('#atb-end').fill('10am');
  await page.waitForTimeout(150);
  expect.soft(await submit.isDisabled(), 'disabled on a zero-length range').toBe(true);

  // Text the parser cannot read is not a time.
  await page.locator('#atb-end').fill('later');
  await page.waitForTimeout(150);
  expect.soft(await submit.isDisabled(), 'disabled on unparseable input').toBe(true);

  await page.locator('#atb-end').fill('11:30am');
  await page.waitForTimeout(150);
  expect.soft(await submit.isDisabled(), 'enabled once the range is valid').toBe(false);

  await ctx.close();
});

test('AddTimeBlock: a saved block is real and lands on the chosen day', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'schedule' });

  // Count what each day already shows, so the assertion is about the change
  // rather than about a seed count typed into the test.
  const countOnDay = async (i) => {
    await page.locator('.schedule-day-chip').nth(i).click();
    await page.waitForTimeout(350);
    return n(page, '.schedule-block');
  };
  const thursdayBefore = await countOnDay(3);
  const fridayBefore = await countOnDay(4);

  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('addTimeBlock');
  });
  await page.waitForTimeout(400);

  const before = await store(page, `(m) => m.getCustomBlocks().length`);

  // Thursday, 2pm to 3:30pm.
  await page.locator('.add-time-block-day-chip').nth(3).click();
  await page.locator('#atb-start').fill('2pm');
  await page.locator('#atb-end').fill('3:30pm');
  await page.waitForTimeout(200);

  await page.locator('.add-time-block-submit').click();
  await page.waitForTimeout(450);

  const blocks = await store(page, `(m) => m.getCustomBlocks().map(b => ({ day: m.blockDayIndex(b), start: m.blockStartH(b), end: m.blockEndH(b), kind: b.kind }))`);
  expect.soft(blocks.length, 'a block was created').toBe(before + 1);

  const created = blocks[blocks.length - 1];
  expect.soft(created.day, 'on the day that was picked').toBe(3);
  expect.soft(created.start, 'starting at 2pm').toBe(14);
  expect.soft(created.end, 'ending at 3:30pm').toBe(15.5);

  // And the calendar shows it on that day, not just in the store.
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('schedule');
  });
  await page.waitForTimeout(400);

  expect.soft(await countOnDay(3), 'Thursday gained exactly the new block').toBe(thursdayBefore + 1);
  expect.soft(await countOnDay(4), 'and no other day changed').toBe(fridayBefore);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Calendar screens render in Arabic and dark without raw keys', async ({ browser }) => {
  for (const screen of ['schedule', 'availability', 'addTimeBlock']) {
    const { page, ctx, errs } = await open(browser, { screen, lang: 'ar', dark: true });
    const body = await page.locator('.phone-frame').innerText();
    expect.soft(/[؀-ۿ]/.test(body), `${screen}: Arabic copy rendered`).toBe(true);
    expect.soft(/schedule[A-Z]|availability[A-Z]|addTimeBlock[A-Z]|dowShort|dowFull/.test(body),
      `${screen}: no raw i18n keys`).toBe(false);
    expect.soft(errs, `${screen}: no page errors`).toEqual([]);
    await ctx.close();
  }
});
