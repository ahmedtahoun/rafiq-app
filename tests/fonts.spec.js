import { test, expect } from '@playwright/test';

/**
 * The two webfonts ship inside the app. They used to come from
 * fonts.googleapis.com, which handed every user's IP and User-Agent to
 * Google on first launch (a line on both stores' privacy forms, for a
 * company otherwise nowhere in the app) and left the Arabic side in a
 * system font whenever the phone was offline.
 */

async function open(page, lang) {
  const outside = [];
  page.on('request', (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) outside.push(r.url());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, lang);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  return outside;
}

test('no font is fetched from Google', async ({ page }) => {
  const outside = await open(page, 'ar');
  expect(outside).toEqual([]);
});

test('Cairo is loaded from the bundle for Arabic, Lora for English headings', async ({ page }) => {
  await open(page, 'ar');
  const ar = await page.evaluate(async () => {
    await document.fonts.load('700 16px Cairo', 'مرحبا');
    return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Cairo' && f.status === 'loaded');
  });
  expect(ar, 'Cairo loaded').toBe(true);

  const en = await page.evaluate(async () => {
    await document.fonts.load('700 16px Lora', 'Rafiq');
    return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Lora' && f.status === 'loaded');
  });
  expect(en, 'Lora loaded').toBe(true);
});
