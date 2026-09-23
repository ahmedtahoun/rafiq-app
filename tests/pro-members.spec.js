import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The Pro's member roster: Clients, AddClient, EditClient, ClientDetail.
 *
 * This half of the app shipped before there were any tests, so none of it
 * was covered. The assertions here are about behaviour a Pro depends on —
 * the roster counts, what each filter actually excludes, that adding a
 * member writes a real record, that archiving is a soft delete rather than
 * a removal — not about markup.
 */

async function open(browser, { screen = 'clients', lang = 'en', dark = false, params = null, seed = null } = {}) {
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
const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();
const n = (page, sel) => page.locator(sel).count();
const go = async (page, screen, params = null) => {
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(350);
};

// ---------------------------------------------------------------------------

test('Clients: the roster and its stats match the data', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  expect.soft(errs, 'no page errors').toEqual([]);
  // Six seeded members, one of them archived (nour).
  expect.soft(await n(page, '.clients-card'), 'all six members listed').toBe(6);

  // Three stats: active, needing a check-in, average progress. The header
  // deliberately does not show a total — an archived member is still listed
  // but is not part of what the Pro is managing this week.
  const stats = (await page.locator('.clients-stat-num').allInnerTexts()).map((s) => s.trim());
  expect.soft(stats.length, 'three stats').toBe(3);
  const [active, needs, avg] = stats;
  expect.soft(active, 'active members (nour is archived)').toBe('5');
  expect.soft(needs, 'needing a check-in (khaled, laila)').toBe('2');
  // Averaged over active members only: (63+40+78+22+55)/5 = 51.6
  expect.soft(avg, 'average progress across active members').toBe('52%');

  await ctx.close();
});

test('Clients: the free-tier cap banner follows the subscription tier', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  // A fresh install is seeded on the Pro tier, so the cap does not apply —
  // `isVerified()` reads the subscription, not credential verification,
  // which is a separate thing entirely.
  expect.soft(await store(page, `(m) => m.isVerified()`), 'seeded on the Pro tier').toBe(true);
  expect.soft(await n(page, '.clients-cap-banner'), 'no cap banner on Pro').toBe(0);

  // Downgrade and the cap bites: five active members against a cap of five.
  await store(page, `(m) => m.setSubscriptionTier('free')`);
  await go(page, 'main');
  await go(page, 'clients');
  expect.soft(await n(page, '.clients-cap-banner'), 'free tier at the cap shows the banner').toBe(1);
  const banner = await txt(page, '.clients-cap-banner');
  expect.soft(banner, 'the banner names the count and the cap').toContain('5');

  // Archiving a member drops below the cap, so the banner goes away — it
  // tracks the active roster, not the total.
  await store(page, `(m) => m.updateClient('mona', { active: false })`);
  await go(page, 'main');
  await go(page, 'clients');
  expect.soft(await n(page, '.clients-cap-banner'), 'below the cap, no banner').toBe(0);

  // Upgrading again clears it regardless of roster size.
  await store(page, `(m) => m.updateClient('mona', { active: true })`);
  await store(page, `(m) => m.setSubscriptionTier('pro')`);
  await go(page, 'main');
  await go(page, 'clients');
  expect.soft(await n(page, '.clients-cap-banner'), 'upgrading clears the banner').toBe(0);

  await ctx.close();
});

test('Clients: search matches names and survives clearing', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  await page.locator('.clients-search-box input').first().fill('mona');
  await page.waitForTimeout(250);
  expect.soft(await n(page, '.clients-card'), 'one match for "mona"').toBe(1);
  expect.soft(await txt(page, '.clients-card-name'), 'the match is Mona').toContain('Mona');

  await page.locator('.clients-search-clear').click();
  await page.waitForTimeout(250);
  expect.soft(await n(page, '.clients-card'), 'clearing restores the roster').toBe(6);

  await ctx.close();
});

test('Clients: search is case-insensitive and can match nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  const input = page.locator('.clients-search-box input').first();

  await input.fill('KHALED');
  await page.waitForTimeout(250);
  expect.soft(await n(page, '.clients-card'), 'uppercase query still matches').toBe(1);

  await input.fill('zzzzz');
  await page.waitForTimeout(250);
  expect.soft(await n(page, '.clients-card'), 'no cards for a query that matches nothing').toBe(0);
  expect.soft(await n(page, '.clients-empty'), 'an empty state is shown instead').toBe(1);

  await ctx.close();
});

test('AddClient: a saved member is a real record, and the roster grows', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addClient' });

  const before = await store(page, `(m) => m.getClients().length`);
  expect.soft(String(before), 'six to start').toBe('6');

  // Save is refused until there is a name — the one required field.
  expect.soft(await page.locator('.add-client-submit').isDisabled(), 'save disabled with no name').toBe(true);

  await page.locator('#acname').fill('Test Member');
  await page.waitForTimeout(200);
  expect.soft(await page.locator('.add-client-submit').isDisabled(), 'save enabled once named').toBe(false);

  await page.locator('.add-client-submit').click();
  await page.waitForTimeout(450);

  const after = await store(page, `(m) => m.getClients().map(c => c.name)`);
  expect.soft(after.length, 'roster grew by one').toBe(before + 1);
  expect.soft(after, 'the new member is stored').toContain('Test Member');

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('AddClient: a whitespace-only name does not create a member', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'addClient' });

  await page.locator('#acname').fill('    ');
  await page.waitForTimeout(200);

  const submit = page.locator('.add-client-submit');
  // Really disabled, not just styled that way — otherwise a keyboard user
  // can focus and activate it and assistive tech calls it available.
  expect.soft(await submit.isDisabled(), 'submit is genuinely disabled').toBe(true);

  // And the guard holds even if the press gets through anyway.
  await submit.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  expect.soft(String(await store(page, `(m) => m.getClients().length`)), 'nothing was created').toBe('6');

  await ctx.close();
});

test('ClientDetail: shows the member it was asked for', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'khaled' } });

  expect.soft(await txt(page, '.client-detail-hero-name'), 'the right member').toContain('Khaled');
  expect.soft(await txt(page, '.client-detail-goal-text'), 'their own goal, not a placeholder')
    .toContain('meditation');
  expect.soft(await txt(page, '.client-detail-hero-stat-num'), 'their own progress').toBe('22%');

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientDetail: toggling a task writes through to the store', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'clientDetail', params: { clientId: 'sara' } });

  const first = await store(page, `(m) => { const t = m.getTasks('sara')[0]; return { id: t.id, done: t.done }; }`);
  await page.locator('.client-detail-task-check').first().click();
  await page.waitForTimeout(300);

  const afterOne = await store(page, `(m) => m.getTasks('sara').find(t => t.id === '${first.id}').done`);
  expect.soft(afterOne, 'the toggle flipped the stored task').toBe(!first.done);

  await page.locator('.client-detail-task-check').first().click();
  await page.waitForTimeout(300);
  const afterTwo = await store(page, `(m) => m.getTasks('sara').find(t => t.id === '${first.id}').done`);
  expect.soft(afterTwo, 'toggling again restores it').toBe(first.done);

  await ctx.close();
});

test('EditClient: archiving is a soft delete, not a removal', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'editClient', params: { clientId: 'mona' } });

  await page.locator('.edit-client-archive-btn').click();
  await page.waitForTimeout(250);
  expect.soft(await n(page, '.edit-client-modal'), 'archiving asks first').toBe(1);
  expect.soft(await txt(page, '.edit-client-modal-title'), 'the confirm names the member').toContain('Mona');

  // Confirm is the destructive-styled button, not the neutral one.
  await page.locator('.edit-client-modal-btn:not(.edit-client-modal-btn-neutral)').first().click();
  await page.waitForTimeout(400);

  const mona = await store(page, `(m) => { const c = m.getClient('mona'); return c ? { exists: true, active: c.active, name: c.name } : { exists: false }; }`);
  expect.soft(mona.exists, 'the record still exists').toBe(true);
  expect.soft(mona.active, 'but is no longer active').toBe(false);
  expect.soft(String(await store(page, `(m) => m.getClients().length`)), 'nothing was deleted').toBe('6');

  // And the roster reflects it: five members were active, now four.
  await go(page, 'clients');
  const stats = await page.locator('.clients-stat-num').allInnerTexts();
  expect.soft(stats[0].trim(), 'active count dropped by one').toBe('4');
  expect.soft(await n(page, '.clients-card'), 'the member is still listed').toBe(6);

  await ctx.close();
});

test('EditClient: cancelling the archive confirm changes nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'editClient', params: { clientId: 'mona' } });

  await page.locator('.edit-client-archive-btn').click();
  await page.waitForTimeout(250);
  await page.locator('.edit-client-modal-btn-neutral').first().click();
  await page.waitForTimeout(300);

  expect.soft(await n(page, '.edit-client-modal'), 'the sheet closed').toBe(0);
  expect.soft(await store(page, `(m) => m.getClient('mona').active`), 'the member is untouched').toBe(true);

  await ctx.close();
});

test('Pro roster renders in Arabic and dark without raw keys', async ({ browser }) => {
  for (const screen of ['clients', 'addClient']) {
    const { page, ctx, errs } = await open(browser, { screen, lang: 'ar', dark: true });
    const body = await txt(page, '.phone-frame');
    expect.soft(/[؀-ۿ]/.test(body), `${screen}: Arabic copy rendered`).toBe(true);
    expect.soft(/clients[A-Z]|addClient[A-Z]/.test(body), `${screen}: no raw i18n keys`).toBe(false);
    expect.soft(await page.locator('html').getAttribute('dir'), `${screen}: document is RTL`).toBe('rtl');
    expect.soft(errs, `${screen}: no page errors`).toEqual([]);
    await ctx.close();
  }
});
