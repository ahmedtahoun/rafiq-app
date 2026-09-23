import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The boundary exists for the case where a screen throws during render.
 *
 * Rather than patching a component to throw, these tests reproduce the
 * failure the way it actually happens in the field: a value in
 * localStorage whose shape no longer matches what the code expects, which
 * is what an app update over existing stored data produces. `readLocal`
 * parses it and casts it to the expected type without checking, so the
 * first screen to iterate it throws.
 *
 * That makes this a test of two things at once — the boundary catches the
 * throw, and a corrupt store degrades to a recoverable screen rather than
 * a blank one.
 */
async function openWithCorruptStore(browser, { lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_tasks_sara', JSON.stringify({ notAnArray: true }));
  }, lang);
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientTasks');
  });
  await page.waitForTimeout(600);
  return { page, ctx, errs };
}

test('a throwing screen shows the fallback instead of a blank page', async ({ browser }) => {
  const { page, ctx } = await openWithCorruptStore(browser);

  await expect(page.locator('.error-boundary')).toHaveCount(1);
  const body = await page.evaluate(() => document.body.innerText);
  expect(body.trim().length, 'the page is not blank').toBeGreaterThan(20);

  await expect(page.locator('.error-boundary-title')).toHaveText('Something went wrong');
  await expect(page.locator('.error-boundary-action')).toHaveText('Reload');
  await expect(page.locator('.error-boundary')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.error-boundary')).toHaveAttribute('dir', 'ltr');

  // The message names what broke — the only thing pointing at the screen
  // once the tree has been replaced.
  await expect(page.locator('.error-boundary-detail')).toContainText('is not a function');

  await ctx.close();
});

test('the fallback is translated and mirrored in Arabic', async ({ browser }) => {
  const { page, ctx } = await openWithCorruptStore(browser, { lang: 'ar' });

  await expect(page.locator('.error-boundary')).toHaveCount(1);
  await expect(page.locator('.error-boundary-title')).toHaveText('حدث خطأ ما');
  await expect(page.locator('.error-boundary-action')).toHaveText('إعادة التحميل');
  await expect(page.locator('.error-boundary')).toHaveAttribute('dir', 'rtl');

  // The thrown message is the app's own English text, so it stays isolated
  // and LTR rather than being reordered into the Arabic paragraph.
  await expect(page.locator('.error-boundary-detail bdi')).toHaveAttribute('dir', 'ltr');

  await ctx.close();
});

test('a healthy store renders the screen, not the fallback', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify('en'));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
  });
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientTasks');
  });
  await page.waitForTimeout(500);

  await expect(page.locator('.error-boundary'), 'boundary stays out of the way').toHaveCount(0);
  await expect(page.locator('.phone-frame')).toHaveCount(1);

  await ctx.close();
});
