# Store screenshots

```sh
npm run screenshots
```

One command. Every image both stores need, in English and Arabic, the
same bytes on every run. Output lands in `out/` and is committed, so
Ahmed can upload without running anything.

```
out/
  en/iphone/01-coach-home.png …  12 × 1320×2868
  en/play/01-coach-home.png   …  12 × 1242×2208  + feature-graphic.png
  ar/iphone/…                    the same twelve, Arabic
  ar/play/…
  shared/play-icon-512.png       512×512
  shared/app-icon-1024.png       1024×1024
```

A sandbox that ships its own Chromium needs `PW_CHROMIUM` pointed at it,
the same as `npm test`:

```sh
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run screenshots
```

## Not part of `npm test`, on purpose

The root `playwright.config.ts` has `testDir: './tests'`, so nothing here
is collected by `npm test` or by CI. These are deliverables, not
assertions: they write PNGs into the repo, they take about a minute, and
a failure means "an image did not render", not "the app is broken". CI
should not be gated on producing marketing assets.

It does still fail loudly on a broken screen: every run collects
`pageerror` and `console.error` and refuses to finish if a screen logged
one. A screenshot of a screen that threw is not shippable.

## Sizes, and why each one

| File | Size | Store | Rule |
|---|---|---|---|
| `*/iphone/*.png` | **1320 × 2868** | App Store | the 6.9" display's required size; 3–10 per language |
| `*/play/NN-*.png` | **1242 × 2208** | Google Play | 320–3840 px a side, **long side ≤ 2× short side**, 24-bit PNG, ≤ 8 MB; 2–8 per language |
| `*/play/feature-graphic.png` | **1024 × 500** | Google Play | fixed size, required before a listing can publish |
| `shared/play-icon-512.png` | **512 × 512** | Google Play | the listing icon |
| `shared/app-icon-1024.png` | **1024 × 1024** | App Store | the listing icon, copied from `assets/icon-only.png` (#83) |

**Play cannot reuse the iPhone images.** 2868 ÷ 1320 is 2.17 : 1, and
Play caps a screenshot's long side at twice its short side. So Play gets
its own capture at 1242 × 2208 (1.78 : 1), which is also inside the
320–3840 range. Both sets are 24-bit RGB with no alpha — Playwright
writes colour type 2 whenever the background is opaque, which is what
Play's "24-bit PNG, no alpha" asks for. The 1024 × 500 feature graphic is
2.05 : 1, which is fine: the 2 : 1 cap is a screenshot rule and the
feature graphic is a separate asset with one fixed size.

Counts: twelve screens are captured, Apple takes up to 10 and Play up to
8. The number in each filename is the upload order — **01–08 to Play,
01–10 to Apple** — and 01–08 tell the story on their own, so 09–12 are
spares to swap in.

## Which screens, and why

Signed in, against `tests/fakeSupabase.js`, never the signed-out demo.
Only screens already reading real rows are here; the member's Programs
and Notifications are left out because Reem is still converting them.

| # | Screen | Why it earns a slot |
|---|---|---|
| 01 | Coach Home | The first thing a coach sees: who is due, what is today, who needs chasing |
| 02 | Coach Members | That the roster is real, and small enough to read |
| 03 | A member's page | The actual working surface — tasks, progress, history in one place |
| 04 | Coach Schedule | Shows the week is the coach's own, not a demo week |
| 05 | Coach Messages | Messaging is in the app, which the listing has to prove (it is not WhatsApp) |
| 06 | Coach Offerings | What a coach sells and for how much, in EGP |
| 07 | Member Home | The other half of the product, for the member half of the audience |
| 08 | Member Discover | How a member finds a coach |
| 09 | Member Tasks | The between-sessions work the description leans on |
| 10 | Member Sessions | Past and upcoming, with recaps |
| 11 | Coach Preview Profile | What a coach's own page looks like to a member — **English only**, see below |
| 12 | Member's coach page | The relationship once it exists — **English only**, see below |

**11 and 12 are captured in English only.** `PreviewProfile` and
`ClientCoach` print `coach_profiles.title` and the language list raw, so
in Arabic they read "Life coaching" and "English" under an Arabic name —
the same stored value Discover translates correctly. That is an app bug,
filed as
[#95](https://github.com/ahmedtahoun/rafiq-app/issues/95) and
deliberately not fixed here (this PR may not touch `src/screens/`). Both
are spares beyond Apple's 10 and Play's 8, so nothing is blocked; add the
Arabic captures by deleting `langs: ['en']` from those two entries in
`shots.mjs` once #95 lands.

## What the images may show

`store/listing.md` sets what the listing may claim; the screenshots are
held to the same line. Nothing here shows an in-app card payment, a push
notification or WhatsApp, because the app does none of them. "Mark paid"
on Home is the coach recording a payment they took elsewhere, which is
what the app actually does.

## The sample practice

`seed.mjs`. Everyone in it is invented:

- No real person's name, and no photographs. Avatars are initials.
- Phone numbers are in the +20 1 55x example range, emails are on
  `example.com`.
- Prices are EGP, the only currency the app charges in.
- Arabic is **not a translation of the English rows** — it is its own
  cast with Arabic names and Arabic content, so an Arabic screenshot
  never shows English text inside an Arabic screen. Values the app
  translates itself (a specialty such as `Life coaching`) stay English in
  both seeds, because they are enum-like keys into
  `src/lib/specialties.ts` and the screen renders them through `t()`.

Two deliberate choices worth knowing:

**The coach has an avatar.** `shots.mjs` draws an initials avatar onto a
canvas and serves it as the coach's uploaded photo. Without one, Home
shows the new-coach setup checklist ("Set up your account, 3 of 4")
instead of the running practice, because the profile step wants a photo
and a bio. The drawn avatar is nobody's face, and a coach who uploads a
plain avatar is ordinary — so the screen is both the stronger image and a
state that can really exist.

**The fake does not enforce the schema.** It models tables, not enums: a
first draft of the seed used `kind: 'blocked'` for a time block, which
the real `time_block_kind` enum (`available`, `busy`, `pending`,
`booked`) would have rejected, and the Schedule screen crashed on the
unknown kind. If a screen throws, suspect the seed before the app.

## Determinism

Two runs on one commit produce the same images:

- the clock is pinned with `page.clock.setFixedTime` to Mon 28 Sep 2026,
  12:00 in Cairo, so every date and "today" is fixed;
- the data is a fixed seed, with no random ids or `Date.now()`;
- `document.fonts.ready` is awaited before each capture, so text never
  renders in a fallback face;
- the shots run one at a time (`workers: 1`).

## Safe to run next to `npm test`

The server runs on port **5174** and prebundles its dependencies into
`store/screenshots/.vite`, not the `node_modules/.vite` that `npm test`'s
server on 5173 owns. Both halves are needed, and the second was learned
the hard way: running the two concurrently on a shared dep cache made
eight unrelated tests fail — a blank Discover list, a status-bar test,
a month-grid helper — none of which had anything to do with either
change. CLAUDE.md's "a blank screen is almost never your code" is the
same failure, and the wasted 13-minute run is why the cache is split
rather than merely documented.

`vite.config.ts` reads `RAFIQ_VITE_CACHE_DIR`; unset, it is Vite's own
default, so `npm run dev`, `npm test` and CI are untouched.

## Capturing the frame

The whole viewport is captured, not the `.phone-frame` element. That is
deliberate: `.phone-frame` is `width: 100%; max-width: 430px`, so at
Apple's 440 px viewport it sits centred with a 5 px gutter each side —
exactly what an iPhone 16 Pro Max shows. Cropping to the element would
produce a 1290 px image when Apple requires 1320. Headless page
screenshots carry no browser chrome, so the viewport *is* the app.

## After changing a screen

Re-run, then **look at the Arabic images**. Every Arabic one in this
batch was checked by eye: direction, bidi ordering, nothing clipped.
`npm test` catches a lot, but it does not catch a name that reads
backwards or a card that cuts a word in half — and a store screenshot is
seen by more people than most screens.
