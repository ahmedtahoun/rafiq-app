import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * The coach's payout account (coach_payout_accounts, 0007), through
 * tests/fakeSupabase.js. What the table accepts is proven against the real
 * constraints by supabase/tests/09_payout_account_app.sql, with the same
 * cases as VALIDATION below; these check the screen — that it validates the
 * same way, writes insert-then-update, and never shows, logs or routes the
 * full national ID or account number once saved.
 *
 * The numbers here are made up and only have to be the right shape.
 */

const UID = 'user-123';
const NATIONAL_ID = '29912310104567';
const WALLET = '01098765432';
const IBAN = 'EG380019000500000000263180002';

const coachTables = (payout = []) => ({
  profiles: [{ id: UID, full_name: 'Rana Coach', email: 'rana@x.com', phone: '', country_code: '+20', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active' }],
  coach_profiles: [{ profile_id: UID, title: 'Nutrition', cert: 'ICF', bio: '', languages: [], session_mode: 'online', experience_years: 1, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  coach_payout_accounts: payout,
});

const savedWallet = { coach_id: UID, issuer: 'vodafone', msisdn: WALLET, bank_code: null, account_number: null, full_name: 'Rana Coach', national_id: NATIONAL_ID };

async function open(browser, { lang = 'en', dark = false, tables = coachTables(), fail, signedIn = true, screen = 'payoutAccount' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  const logged = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    logged.push(m.text());
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { tables, fail });
  if (signedIn) await signIn(page, UID);
  if (screen) await nav(page, screen);
  return { page, ctx, errs, logged };
}

async function nav(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}

const currentScreen = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const payoutCalls = async (page, op) => (await dbCalls(page)).filter((c) => c.table === 'coach_payout_accounts' && (!op || c.op === op));

/** Everything the page could leak a value through: the DOM (text and
    attributes, inputs included), the URL, and what it logged. */
async function exposedText(page, logged) {
  const dom = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, select')].map((i) => i.value);
    return [document.documentElement.outerHTML, ...inputs, location.href].join('\n');
  });
  return [dom, ...logged].join('\n');
}

async function fillWallet(page, { issuer = 'Vodafone Cash', msisdn = WALLET, name = 'Rana Coach', nationalId = NATIONAL_ID } = {}) {
  await page.getByRole('radio', { name: issuer }).click();
  await page.locator('#payout-msisdn').fill(msisdn);
  await page.locator('#payout-fullName').fill(name);
  await page.locator('#payout-nationalId').fill(nationalId);
}

// --- Validation --------------------------------------------------------------

// [label, form overrides, the fields expected to fail]. The same cases run
// against the real check constraints in supabase/tests/09_payout_account_app.sql.
const VALIDATION = [
  ['wallet, valid', {}, []],
  ['wallet, 10 digits', { msisdn: '0109876543' }, ['msisdn']],
  ['wallet, 12 digits', { msisdn: '010987654321' }, ['msisdn']],
  ['wallet, not starting 01', { msisdn: '02098765432' }, ['msisdn']],
  ['wallet, letters', { msisdn: '0109876543a' }, ['msisdn']],
  ['bank, 6-digit account', { method: 'bank', bankCode: 'CIB', accountNumber: '123456' }, []],
  ['bank, 20-digit account', { method: 'bank', bankCode: 'NBE', accountNumber: '12345678901234567890' }, []],
  ['bank, 5-digit account', { method: 'bank', bankCode: 'NBE', accountNumber: '12345' }, ['accountNumber']],
  ['bank, 21-digit account', { method: 'bank', bankCode: 'NBE', accountNumber: '123456789012345678901' }, ['accountNumber']],
  ['bank, IBAN', { method: 'bank', bankCode: 'MISR', accountNumber: IBAN }, []],
  ['bank, IBAN one digit short', { method: 'bank', bankCode: 'MISR', accountNumber: IBAN.slice(0, -1) }, ['accountNumber']],
  ['bank, non-Egyptian IBAN', { method: 'bank', bankCode: 'MISR', accountNumber: 'GB' + IBAN.slice(2) }, ['accountNumber']],
  ['bank, no bank chosen', { method: 'bank', bankCode: '', accountNumber: '123456' }, ['bankCode']],
  ['bank, lower-case code', { method: 'bank', bankCode: 'cib', accountNumber: '123456' }, ['bankCode']],
  ['bank, 11-letter code', { method: 'bank', bankCode: 'ABCDEFGHIJK', accountNumber: '123456' }, ['bankCode']],
  ['name blank', { fullName: '   ' }, ['fullName']],
  ['national id, 13 digits', { nationalId: NATIONAL_ID.slice(1) }, ['nationalId']],
  ['national id, 15 digits', { nationalId: NATIONAL_ID + '1' }, ['nationalId']],
  ['everything missing', { msisdn: '', fullName: '', nationalId: '' }, ['msisdn', 'fullName', 'nationalId']],
];

test('the form accepts exactly what the database accepts', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async ({ VALIDATION, base }) => {
    const { validatePayoutAccount } = await import('/src/lib/payoutAccount.ts');
    return VALIDATION.map(([label, over]) => {
      const r = validatePayoutAccount({ ...base, ...over });
      return [label, r.ok ? [] : Object.keys(r.errors).sort()];
    });
  }, { VALIDATION, base: { method: 'wallet', walletIssuer: 'vodafone', msisdn: WALLET, bankCode: '', accountNumber: '', fullName: 'Rana Coach', nationalId: NATIONAL_ID } });
  for (const [i, [label, fields]] of results.entries()) {
    expect.soft(fields, label).toEqual([...VALIDATION[i][2]].sort());
  }
});

test('typing habits are normalized, never reinterpreted', async ({ page }) => {
  await page.goto('/');
  const rows = await page.evaluate(async () => {
    const { validatePayoutAccount } = await import('/src/lib/payoutAccount.ts');
    const base = { walletIssuer: 'orange', bankCode: 'CIB', accountNumber: '', fullName: '  Rana Coach  ', nationalId: '٢٩٩١٢٣١٠١٠٤٥٦٧' };
    return [
      validatePayoutAccount({ ...base, method: 'wallet', msisdn: '٠١٠ ٩٨٧٦ ٥٤٣٢' }),
      validatePayoutAccount({ ...base, method: 'wallet', msisdn: '+20 109-876-5432' }),
      validatePayoutAccount({ ...base, method: 'wallet', msisdn: '0020 109 876 5432' }),
      validatePayoutAccount({ ...base, method: 'bank', msisdn: '010', accountNumber: 'eg38 0019 0005 0000 0000 2631 8000 2' }),
    ];
  });
  const wallet = { issuer: 'orange', msisdn: WALLET, bank_code: null, account_number: null, full_name: 'Rana Coach', national_id: NATIONAL_ID };
  expect(rows[0]).toEqual({ ok: true, row: wallet });
  expect(rows[1]).toEqual({ ok: true, row: wallet });
  expect(rows[2]).toEqual({ ok: true, row: wallet });
  // Switching to bank drops the wallet number instead of carrying it along.
  expect(rows[3]).toEqual({ ok: true, row: { issuer: 'instant_bank', msisdn: null, bank_code: 'CIB', account_number: IBAN, full_name: 'Rana Coach', national_id: NATIONAL_ID } });
});

// --- Signed out --------------------------------------------------------------

test('signed out, it asks to sign in and shows no account, real or made up', async ({ browser }) => {
  for (const lang of ['en', 'ar']) {
    const { page, ctx, errs } = await open(browser, { lang, signedIn: false });
    const text = await page.locator('.phone-frame').innerText();
    expect(text).toContain(lang === 'en' ? 'Sign in to set up payouts' : 'سجّل الدخول لإعداد استلام أرباحك');
    await expect(page.locator('form, input, select, [data-testid="payout-saved"]')).toHaveCount(0);
    expect(await payoutCalls(page), 'nothing is read or written').toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

// --- Getting there -----------------------------------------------------------

test('Profile has a Payout account row, Earnings links to it, and back returns to Profile', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await page.locator('.profile-row', { hasText: 'Payout account' }).click();
  expect(await currentScreen(page)).toBe('payoutAccount');
  await page.getByRole('button', { name: 'Back' }).click();
  expect(await currentScreen(page)).toBe('profile');

  await nav(page, 'earnings');
  await page.locator('.earnings-payout-link').click();
  expect(await currentScreen(page)).toBe('payoutAccount');
  await page.getByRole('button', { name: 'Back' }).click();
  expect(await currentScreen(page)).toBe('earnings');

  // Deep-linked with no history, back still has somewhere to go.
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav('payoutAccount');
    useAppStore.setState({ hist: [] });
  });
  await page.getByRole('button', { name: 'Back' }).click();
  expect(await currentScreen(page)).toBe('profile');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Saving ------------------------------------------------------------------

test('first save inserts once, and afterwards only the last four digits are anywhere', async ({ browser }) => {
  const { page, ctx, errs, logged } = await open(browser);
  await expect(page.locator('#payout-msisdn')).toBeVisible();

  // An invalid form writes nothing and says what to fix.
  await page.getByRole('button', { name: 'Save payout account' }).click();
  await expect(page.locator('.payout-field-error')).toHaveCount(3);
  await expect(page.locator('#payout-msisdn')).toHaveAttribute('aria-invalid', 'true');
  expect(await payoutCalls(page, 'insert')).toEqual([]);

  // Arabic-Indic digits and spaces, the way a phone keyboard may type them.
  await fillWallet(page, { issuer: 'Etisalat Cash', msisdn: '٠١٠ ٩٨٧٦ ٥٤٣٢' });
  await page.getByRole('button', { name: 'Save payout account' }).click();
  await expect(page.getByTestId('payout-saved')).toBeVisible();

  expect(await payoutCalls(page, 'update'), 'a new account is inserted, not updated').toEqual([]);
  expect((await payoutCalls(page, 'insert')).length).toBe(1);
  expect(await dbRows(page, 'coach_payout_accounts')).toEqual([{ ...savedWallet, issuer: 'etisalat' }]);

  const saved = await page.getByTestId('payout-saved').innerText();
  expect(saved).toContain('Etisalat Cash');
  expect(saved).toContain('5432');
  expect(saved).toContain('4567');
  const exposed = await exposedText(page, logged);
  expect(exposed.includes(WALLET), 'wallet number shown, logged or in the URL').toBe(false);
  expect(exposed.includes(NATIONAL_ID), 'national ID shown, logged or in the URL').toBe(false);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('changing a saved wallet to a bank account updates the row and clears the wallet number', async ({ browser }) => {
  const { page, ctx, errs, logged } = await open(browser, { tables: coachTables([{ ...savedWallet }]) });
  await expect(page.getByTestId('payout-saved')).toBeVisible();

  // What was read is shown masked; the full values never reach the page.
  let exposed = await exposedText(page, logged);
  expect(exposed.includes(WALLET)).toBe(false);
  expect(exposed.includes(NATIONAL_ID)).toBe(false);

  await page.getByRole('button', { name: 'Change payout account' }).click();
  // Sensitive fields start empty, with the saved one's last four as a hint.
  await expect(page.locator('#payout-msisdn')).toHaveValue('');
  await expect(page.locator('#payout-nationalId')).toHaveValue('');
  await expect(page.locator('#payout-nationalId-hint')).toContainText('4567');
  await expect(page.locator('#payout-fullName')).toHaveValue('Rana Coach');

  await page.getByRole('radio', { name: 'Bank account' }).click();
  await page.locator('#payout-bankCode').selectOption('CIB');
  await page.locator('#payout-accountNumber').fill(IBAN.toLowerCase());
  await page.locator('#payout-nationalId').fill(NATIONAL_ID);
  await page.getByRole('button', { name: 'Save payout account' }).click();
  await expect(page.getByTestId('payout-saved')).toBeVisible();

  // Insert first; the row exists, so then update — never an upsert.
  // (Reads left out: StrictMode runs the loading effect twice in dev.)
  const writes = (await payoutCalls(page)).filter((c) => c.op !== 'select');
  expect(writes.map((c) => c.op)).toEqual(['insert', 'update']);
  expect(writes[1].filters).toEqual([['coach_id', UID]]);
  expect(await dbRows(page, 'coach_payout_accounts')).toEqual([
    { coach_id: UID, issuer: 'instant_bank', msisdn: null, bank_code: 'CIB', account_number: IBAN, full_name: 'Rana Coach', national_id: NATIONAL_ID },
  ]);

  const saved = await page.getByTestId('payout-saved').innerText();
  expect(saved).toContain('Commercial International Bank');
  expect(saved).toContain('0002');
  exposed = await exposedText(page, logged);
  expect(exposed.includes(IBAN)).toBe(false);
  expect(exposed.includes(NATIONAL_ID)).toBe(false);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed save keeps the form, says so, and carries no values in the error', async ({ browser }) => {
  const { page, ctx, errs, logged } = await open(browser);
  await setFailing(page, ['coach_payout_accounts.insert']);
  await fillWallet(page);
  await page.getByRole('button', { name: 'Save payout account' }).click();
  await expect(page.locator('.payout-save-error')).toHaveText("Your payout account wasn't saved. Please try again.");
  await expect(page.getByTestId('payout-saved')).toHaveCount(0);
  await expect(page.locator('#payout-msisdn')).toHaveValue(WALLET);
  expect(logged.join('\n').includes(WALLET)).toBe(false);

  const result = await page.evaluate(async () => (await import('/src/lib/payoutData.ts')).saveOwnPayoutAccount({
    issuer: 'vodafone', msisdn: '01098765432', bank_code: null, account_number: null, full_name: 'Rana Coach', national_id: '29912310104567',
  }));
  expect(result.ok).toBe(false);
  expect(result.message.includes(WALLET) || result.message.includes(NATIONAL_ID) || result.message.includes('network down')).toBe(false);

  await setFailing(page, []);
  await page.getByRole('button', { name: 'Save payout account' }).click();
  await expect(page.getByTestId('payout-saved')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows the retry state, not an empty form', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { tables: coachTables([{ ...savedWallet }]), fail: ['coach_payout_accounts.select'] });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#payout-msisdn')).toHaveCount(0);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('payout-saved')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Arabic and dark ---------------------------------------------------------

test('in Arabic and dark mode, names and masked numbers stay isolated and readable', async ({ browser }) => {
  const name = '10 Rana Coach';
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, tables: coachTables([{ ...savedWallet, full_name: name }]) });
  await expect(page.getByTestId('payout-saved')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

  const saved = page.getByTestId('payout-saved');
  await expect(saved.locator('bdi')).toHaveText(name);
  const text = await saved.innerText();
  expect(text).toContain('فودافون كاش');
  // Each masked number is isolated inside its sentence (U+2068 … U+2069).
  expect(text).toContain('ينتهي بـ ⁨•••• 5432⁩');
  expect(text).toContain('ينتهي بـ ⁨•••• 4567⁩');

  await page.getByRole('button', { name: 'تغيير حساب الاستلام' }).click();
  await page.getByRole('radio', { name: 'حساب بنكي' }).click();
  // Bank names are listed in Arabic.
  expect(await page.locator('#payout-bankCode option[value="NBE"]').innerText()).toBe('البنك الأهلي المصري');
  await page.getByRole('button', { name: 'حفظ حساب الاستلام' }).click();
  await expect(page.locator('#payout-bankCode-hint')).toHaveText('اختر البنك.');

  // Dark mode: nothing on the form falls back to black text or a white field.
  const colors = await page.evaluate(() => [...document.querySelectorAll('.payout-input, .payout-label, .payout-field-hint, .payout-field-error, .payout-chip, .payout-segment-btn')].map((el) => {
    const s = getComputedStyle(el);
    return [el.className, s.color, s.backgroundColor];
  }));
  for (const [cls, color, bg] of colors) {
    expect.soft(color, `${cls} text`).not.toBe('rgb(0, 0, 0)');
    expect.soft(bg, `${cls} background`).not.toBe('rgb(255, 255, 255)');
  }
  expect(errs).toEqual([]);
  await ctx.close();
});
