import { test, expect } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IGNORED_CONSOLE, installScreenSettle } from '../../tests/helpers.js';
import { installFakeSupabase, signIn, setFunctionReply } from '../../tests/fakeSupabase.js';
import { installFakeCall } from '../../tests/fakeVideoCall.js';
import { NOW, COACH, MEMBER, COPY, coachTables, memberTables } from './seed.mjs';
import { featureGraphic } from './feature-graphic.mjs';

/**
 * Every image the two stores need, in English and Arabic, the same on
 * every run. See README.md for the sizes and why each screen is here.
 *
 * Determinism: the clock is pinned (`page.clock.setFixedTime`), the data
 * is a fixed seed, fonts are awaited before each capture, and the shots
 * run one at a time. Two runs on the same commit produce the same bytes.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const REPO = join(HERE, '..', '..');

/**
 * Apple wants 1320×2868 for the 6.9" display; Google caps a screenshot's
 * long side at twice its short side, and 2868/1320 is 2.17:1, so Play
 * cannot reuse Apple's image — it gets its own 1242×2208 (1.78:1).
 */
const DEVICES = {
  iphone: { width: 440, height: 956, scale: 3 }, // 1320 × 2868
  play: { width: 414, height: 736, scale: 3 }, //  1242 × 2208
};

/**
 * Ordered: the filename's number is the upload order. Apple takes up to
 * 10 per language, Google up to 8, so the first eight carry the story on
 * their own and 09–12 are there for Apple and for Ahmed to swap in.
 */
/**
 * The session the call shots use: `s-3` / `tb-3` in the coach seed runs
 * 08:30–09:20 UTC, and NOW is 09:00, so it is live without moving the
 * clock or adding a row. Its member is the third of the seed's three, so
 * the name is theirs in whichever language is being shot.
 */
const CALL_SESSION = 's-3';
const callParams = (lang) => ({ sessionId: CALL_SESSION, name: COPY[lang].members[2].name });

/**
 * What the `session-video` function would answer for it. The url and
 * token are never dialled — `installFakeCall` has replaced Daily — so
 * they only have to be the right shape. `closes_at` is the end of the
 * booking plus the 30 minutes `JOIN_LATE_MIN` allows.
 */
const callPass = (lang) => ({
  url: `https://rafiq.daily.co/rafiq-${CALL_SESSION}`,
  token: 'screenshot-token',
  role: 'coach',
  other_name: COPY[lang].members[2].name,
  closes_at: '2026-09-28T09:50:00Z',
});

const SHOTS = [
  { n: 1, id: 'coach-home', side: 'coach', screen: 'main' },
  { n: 2, id: 'coach-members', side: 'coach', screen: 'clients' },
  { n: 3, id: 'coach-member', side: 'coach', screen: 'clientDetail', params: { clientId: 'c-nour' } },
  { n: 4, id: 'coach-schedule', side: 'coach', screen: 'schedule' },
  // 05 and 06 are the 1:1 call, placed inside Play's eight because it is
  // the thing the listing is selling and Play shows only the first eight.
  // They cost Offerings and Discover their place in that eight (both are
  // 09 and 10 now, still inside Apple's ten) — see README.md, which spells
  // out the trade and how to undo it.
  { n: 5, id: 'coach-session-ready', side: 'coach', screen: 'sessionRoom', params: callParams },
  // Same screen, so no navigation: `act` joins the call the room is
  // already offering, and brings the other person in.
  { n: 6, id: 'coach-session-call', side: 'coach', act: joinTheCall },
  { n: 7, id: 'coach-messages', side: 'coach', screen: 'messagesInbox' },
  { n: 8, id: 'member-home', side: 'member', screen: 'clientHome' },
  { n: 9, id: 'coach-offerings', side: 'coach', screen: 'offerings' },
  { n: 10, id: 'member-discover', side: 'member', screen: 'discover' },
  { n: 11, id: 'member-tasks', side: 'member', screen: 'clientTasks' },
  { n: 12, id: 'member-sessions', side: 'member', screen: 'clientSchedule' },
  // English only until the untranslated specialty/language chips are
  // fixed: PreviewProfile and ClientCoach print coach_profiles.title and
  // the language list raw, so the Arabic ones read "Life coaching" under
  // an Arabic name. Both are spares beyond either store's cap, so holding
  // them back costs no upload. See the issue linked in README.md.
  { n: 13, id: 'coach-preview', side: 'coach', screen: 'previewProfile', langs: ['en'] },
  { n: 14, id: 'member-coach', side: 'member', screen: 'clientCoach', langs: ['en'] },
];

/**
 * Join the call that shot 05 left on its ready screen, and put the other
 * person in it.
 *
 * Nothing here touches Daily or a camera: `installFakeCall` swapped the
 * factory in `openSide`, and `setFunctionReply` answers the one Edge
 * Function call the room makes. With no video track on either side the
 * room draws each participant as an initials avatar, which is what these
 * screenshots want anyway — the seed has no faces in it.
 */
async function joinTheCall(page, lang) {
  await setFunctionReply(page, 'session-video', 200, callPass(lang));
  await page.locator('.session-room-join').click();
  await expect(page.locator('.session-room-live'), 'the call never went live').toBeVisible();
  // Until this fires the stage reads "Waiting for … to join", which is
  // the wrong frame for a store listing: it sells an empty room.
  await page.evaluate(() => window.__video.emit(true));
  await expect(page.locator('.session-room-stage-name')).toHaveText(COPY[lang].members[2].name);

  // The self tile is a <video> fed by a canvas: capturing before its
  // first frame arrives would photograph a black rectangle.
  await page.waitForFunction(() => {
    const v = document.querySelector('.session-room-video-self');
    return v instanceof HTMLVideoElement && v.videoWidth > 0 && v.readyState >= 2;
  }, null, { timeout: 10_000 });
  // Stop repainting so the element holds one still frame; frames still
  // arriving during the capture make the PNG differ between runs.
  await page.evaluate(() => window.__video.freeze());
  await page.waitForTimeout(500);
  // The stand-in is painted mirrored so the screen's own mirror cancels
  // it (tests/fakeVideoCall.js). If the screen ever stops mirroring, the
  // compensation would start printing the initials backwards — fail
  // here rather than ship that to a store.
  await expect(
    page.locator('.session-room-video-self'),
    'the self tile is no longer mirrored: drop the pre-flip in installFakeCall',
  ).toHaveClass(/is-mirrored/);
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * The fake's storage hands back a 1×1 transparent PNG for every signed
 * URL, which would show as an empty circle wherever the app expects a
 * photo. Draw an initials avatar instead: no real person's face, and the
 * coach's profile then reads as finished so Home shows the running
 * practice rather than the new-coach setup checklist.
 */
async function serveInitialsAvatar(page, { initials, bg = '#B75C3D' }) {
  await page.evaluate(async ({ initials, bg }) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#FFFFFF';
    g.font = '600 110px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(initials, 128, 140);
    const url = c.toDataURL('image/png');

    const { getSupabase } = await import('/src/lib/supabase.ts');
    const real = getSupabase();
    const inner = real.storage.from.bind(real.storage);
    Object.defineProperty(real, 'storage', {
      value: {
        from: (bucket) => ({ ...inner(bucket), createSignedUrl: async () => ({ data: { signedUrl: url }, error: null }) }),
      },
      configurable: true,
    });
  }, { initials, bg });
}

/** A context at one device size, signed in as one side, in one language. */
async function openSide(browser, { lang, device, side }) {
  const d = DEVICES[device];
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.scale,
    // The app's own locale switch drives direction and fonts; this only
    // keeps Chromium's own text shaping consistent with it.
    locale: lang === 'ar' ? 'ar-EG' : 'en-GB',
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  // Before the first goto, as installScreenSettle's own note requires.
  await installScreenSettle(page);

  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });

  await page.goto('/');
  await page.evaluate(([role, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(role));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(false));
  }, [side === 'coach' ? 'coach' : 'client', lang]);
  await page.reload();

  const userId = side === 'coach' ? COACH : MEMBER;
  const tables = side === 'coach' ? coachTables(lang) : memberTables(lang);
  await installFakeSupabase(page, { userId, tables });
  const initialsOf = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  if (side === 'coach') {
    await serveInitialsAvatar(page, { initials: initialsOf(tables.profiles[0].full_name) });
  }
  await signIn(page, userId);
  // Before any shot opens the session room. Harmless for the rest: the
  // factory is only reached when someone taps Join, and nothing in this
  // harness ever reaches Daily or asks for a camera.
  await installFakeCall(page, {
    selfVideo: side === 'coach' ? { initials: initialsOf(tables.profiles[0].full_name) } : null,
  });

  return { ctx, page, errs };
}

/**
 * Navigate, then wait for the screen rather than for a stopwatch.
 *
 * `__screenSettled` comes from tests/helpers.js, added by #82 when
 * App.tsx started loading each screen as its own chunk. This harness
 * needs it more than any spec does: it used to wait for `.phone-frame`
 * to be visible and `.load-state` to be gone, and both are true of the
 * screen being navigated *away from* while the next one's chunk is in
 * flight. Against lazy screens that first broke loudly — two
 * `.phone-frame` elements at once, because React lays the new tree out
 * before it removes the old — and a looser wait would have been worse:
 * it would have quietly photographed the Suspense fallback. A store
 * screenshot of a loading spinner is the one defect here nobody would
 * catch until Apple did.
 */
async function show(page, screen, params) {
  const settled = await page.evaluate(async ([s, p]) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav(p ? { screen: s, params: p } : s);
    return await window.__screenSettled();
  }, [screen, params ?? null]);
  expect(settled, `${screen} never settled: its chunk or a read did not finish`).toBe(true);

  await settleMedia(page);
}

/**
 * Fonts and images in, then a beat for the entrance transition.
 *
 * The images matter and were missing: `02-coach-members` came out with a
 * different hash on roughly one run in three, because an avatar had not
 * finished decoding when the shutter fired. `__screenSettled` watches
 * the chunk and the paint, and `document.fonts.ready` the text — neither
 * waits for an <img>. Everything else on these screens happened to be
 * fast enough to hide it.
 */
async function settleMedia(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map((img) => img.decode().catch(() => {})),
    );
  });
  // The one-off entrance transitions in the screen CSS, which nothing
  // above watches.
  await page.waitForTimeout(400);
}

for (const lang of ['en', 'ar']) {
  for (const device of Object.keys(DEVICES)) {
    test(`${device} screenshots (${lang})`, async ({ browser }) => {
      const dir = join(OUT, lang, device);
      await mkdir(dir, { recursive: true });

      for (const side of ['coach', 'member']) {
        const mine = SHOTS.filter((s) => s.side === side && (!s.langs || s.langs.includes(lang)));
        if (!mine.length) continue;
        const { ctx, page, errs } = await openSide(browser, { lang, device, side });

        for (const shot of mine) {
          // `params` may be a function of the language, because a shot's
          // subject is named in the language being shot.
          const params = typeof shot.params === 'function' ? shot.params(lang) : shot.params;
          if (shot.screen) await show(page, shot.screen, params);
          if (shot.act) {
            await shot.act(page, lang);
            await settleMedia(page);
          }
          // The whole viewport, which is what the device itself shows:
          // .phone-frame caps at 430px, so at Apple's 440 there is a 5px
          // gutter each side — real, and cropping it out would make the
          // image 1290 wide when Apple asks for 1320. Headless page
          // screenshots carry no browser chrome.
          //
          // `animations: 'disabled'` is what makes "the same bytes every
          // run" true on a screen that moves. It rewinds an infinite CSS
          // animation to its first frame and runs a finite one to its
          // last. The session room's live dot pulses forever
          // (SessionRoom.css:185), so without this its opacity — and the
          // file's hash — depended on when the capture happened to land.
          // The app has exactly two infinite animations, that dot and
          // LoadState's spinner, and a shot of the spinner would be a
          // bug anyway.
          await page.screenshot({ path: join(dir, `${pad(shot.n)}-${shot.id}.png`), animations: 'disabled' });
        }

        // A screenshot of a screen that logged an error is not shippable.
        expect(errs, `console errors while shooting ${side} in ${lang}`).toEqual([]);
        await ctx.close();
      }
    });
  }
}

test('feature graphic and icon', async ({ browser }) => {
  for (const lang of ['en', 'ar']) {
    const dir = join(OUT, lang, 'play');
    await mkdir(dir, { recursive: true });

    // Drawn inside the running app so it inherits tokens.css and the
    // real Lora/Cairo webfonts, and takes the R mark from #83's single
    // definition (src/lib/logoMark.ts) rather than a second copy.
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(([l]) => {
      localStorage.clear();
      localStorage.setItem('rafiq_lang', JSON.stringify(l));
      localStorage.setItem('rafiq_dark', JSON.stringify(false));
    }, [lang]);
    await page.reload();

    await page.evaluate(featureGraphic, { lang });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.locator('#feature-graphic').screenshot({ path: join(dir, 'feature-graphic.png') });
    await ctx.close();
  }

  // Play's 512×512 icon, redrawn from the same mark at the size Play
  // wants. assets/icon-only.png from #83 is 1024×1024; rendering the
  // vector again beats downscaling a bitmap.
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(async () => {
    const { MARK_R_PATH, MARK_FROM, MARK_TO, MARK_INK, markGlyphTransform } = await import('/src/lib/logoMark.ts');
    document.body.innerHTML = `
      <svg id="icon" width="512" height="512" viewBox="0 0 100 100">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${MARK_FROM}"/><stop offset="1" stop-color="${MARK_TO}"/>
        </linearGradient></defs>
        <rect width="100" height="100" fill="url(#g)"/>
        <path d="${MARK_R_PATH}" transform="${markGlyphTransform(0.33)}" fill="${MARK_INK}"/>
      </svg>`;
    document.body.style.cssText = 'margin:0;padding:0;line-height:0';
    await document.fonts.ready;
  });
  await mkdir(join(OUT, 'shared'), { recursive: true });
  await page.locator('#icon').screenshot({ path: join(OUT, 'shared', 'play-icon-512.png') });
  await ctx.close();

  // The 1024×1024 master, straight from #83, for Apple's listing field.
  await copyFile(join(REPO, 'assets', 'icon-only.png'), join(OUT, 'shared', 'app-icon-1024.png'));
});
