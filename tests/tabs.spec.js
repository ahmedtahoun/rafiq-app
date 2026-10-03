import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Step 3 of the UI/UX review (1 Oct 2026): five named tabs a side, the
 * language and dark-mode buttons out of in-app headers, simpler member
 * cards, and a Messages list that doesn't read as empty conversations.
 * Before, both bars had six slots and named only the open one.
 */

async function open(browser, { lang = 'en', role = 'coach', screen } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, [role, lang]);
  await page.reload();
  if (screen) await go(page, screen);
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(350);
}
const currentScreen = async (page) => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen;

const BARS = {
  coach: {
    screens: ['main', 'clients', 'schedule', 'messagesInbox', 'profile'],
    en: ['Home', 'Members', 'Schedule', 'Messages', 'Profile'],
    ar: ['الرئيسية', 'الأعضاء', 'الجدول', 'الرسائل', 'حسابي'],
  },
  client: {
    screens: ['clientHome', 'clientSchedule', 'clientTasks', 'clientCoach', 'clientProfile'],
    en: ['Home', 'Sessions', 'Tasks', 'Your Pro', 'Profile'],
    ar: ['الرئيسية', 'الجلسات', 'المهام', 'محترفك', 'حسابي'],
  },
};

for (const role of ['coach', 'client']) {
  for (const lang of ['en', 'ar']) {
    test(`${role}: five tabs, every one named, each opening its screen and showing it is open (${lang})`, async ({ browser }) => {
      const { screens, [lang]: names } = BARS[role];
      const { page, ctx, errs } = await open(browser, { lang, role, screen: screens[0] });
      for (const [i, screen] of screens.entries()) {
        const tabs = page.locator('.bottom-nav-item');
        await expect(tabs).toHaveCount(5);
        await expect(tabs.locator('.bottom-nav-label')).toHaveText(names);
        // A label that fits: nothing is cut off with an ellipsis.
        const clipped = await tabs.locator('.bottom-nav-label').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
        expect(clipped, `${screen}: labels fit`).toEqual([]);
        await tabs.nth(i).click();
        await page.waitForTimeout(250);
        expect(await currentScreen(page)).toBe(screen);
        await expect(page.locator('.bottom-nav-item-active')).toHaveText(names[i]);
        // The language and dark-mode buttons live in Profile › Preferences now.
        await expect(page.getByRole('button', { name: lang === 'ar' ? 'تغيير اللغة' : 'Switch language' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: lang === 'ar' ? 'تبديل الوضع الداكن' : 'Toggle dark mode' })).toHaveCount(0);
      }
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('language and dark mode still change from Profile › Preferences', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await page.locator('.profile-lang-pill').filter({ hasText: 'العربية' }).click();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await page.locator('.profile-row', { hasText: 'الوضع الداكن' }).locator('.profile-switch').click();
  expect(await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().dark)).toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the coach\'s quick actions moved from the tab bar to Home\'s header', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'main' });
  await expect(page.locator('.bottom-nav .qa-fab')).toHaveCount(0);
  await page.locator('.main-hero .qa-fab').click();
  await expect(page.getByRole('menuitem')).not.toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member card shows name, programme, next session, one status, and the star', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clients' });
  const card = page.locator('.clients-card', { hasText: 'Sara Ahmed' });
  await expect(card.locator('.clients-progress-ring, .qa-fab')).toHaveCount(0);
  await expect(card.locator('.clients-card-next')).toBeVisible();
  await expect(card.locator('.clients-status-badge')).toHaveCount(1);
  await expect(card.getByRole('button', { name: /favourite/i })).toHaveCount(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Messages: members with no messages sit under "Start a conversation", once', async ({ browser }) => {
  for (const [lang, heading] of [['en', 'Start a conversation'], ['ar', 'ابدأ محادثة']]) {
    const { page, ctx, errs } = await open(browser, { lang, screen: 'messagesInbox' });
    await expect(page.locator('.messages-inbox-section')).toHaveText([heading]);
    // Every row after the heading is an empty thread, and none before it is.
    const order = await page.locator('.messages-inbox-section, .messages-inbox-row').evaluateAll((els) => els.map((e) => (e.classList.contains('messages-inbox-section') ? 'H' : e.querySelector('.is-placeholder') ? 'empty' : 'thread')));
    const h = order.indexOf('H');
    expect(order.slice(0, h)).not.toContain('empty');
    expect(order.slice(h + 1).every((x) => x === 'empty')).toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});
