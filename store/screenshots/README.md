# Store screenshots

```sh
npm run screenshots
```

One command. Every image both stores need, in English and Arabic.
Output lands in `out/` and is committed, so Ahmed can upload without
running anything.

The run is **close to byte-reproducible, not quite**. See "How
reproducible this actually is" below before you treat a changed PNG as a
signal.

```
out/
  en/iphone/01-coach-home.png …  14 × 1320×2868
  en/play/01-coach-home.png   …  14 × 1242×2208  + feature-graphic.png
  ar/iphone/…                    14 × 1320×2868, Arabic
  ar/play/…                      14 × 1242×2208, Arabic
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

Counts: fourteen screens are captured, Apple takes up to 10 and Play up
to 8. The number in each filename is the upload order — **01–08 to Play,
01–10 to Apple** — and 01–08 tell the story on their own, so 09–14 are
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
| 05 | Session, before joining | The 1:1 call exists and is about to start — and says "Nothing is recorded" on the screen itself |
| 06 | Session, in the call | The call running, with the other person in it. The feature the listing sells |
| 07 | Coach Messages | Messaging is in the app, which the listing has to prove (it is not WhatsApp) |
| 08 | Member Home | The other half of the product, for the member half of the audience |
| 09 | Coach Offerings | What a coach sells and for how much, in EGP |
| 10 | Member Discover | How a member finds a coach |
| 11 | Member Tasks | The between-sessions work the description leans on |
| 12 | Member Sessions | Past and upcoming, with recaps |
| 13 | Coach Preview Profile | What a coach's own page looks like to a member |
| 14 | Member's coach page | The relationship once it exists |

### What 05 and 06 cost, and how to undo it

Play shows only the first eight, so putting the call at 05 and 06 pushed
two screens out of that set. **Offerings and Discover** took it: they are
09 and 10 now, still inside Apple's ten, but no longer on the Play
listing. The order after 04 is a judgement about merchandising rather
than a fact — the story runs schedule → join → in the call → message
between sessions, and the call is the thing the description leads on. If
you would rather keep pricing or discovery in Play's eight, renumber the
`n` values in `shots.mjs`; nothing else depends on them.

### How the call is captured

No Daily, no camera, no token that works: `tests/fakeVideoCall.js` swaps
the call out through `setVideoCallFactory`, the same fake
`tests/session-video.spec.js` uses, and `setFunctionReply` answers the
one `session-video` call the room makes. The session is `s-3` in the
seed, which runs 08:30–09:20 UTC against a clock pinned to 09:00, so it
is live without inventing a row.

Nobody's face appears. The other participant has no video track, so the
screen falls back to an initials avatar — what it really does for
someone whose camera is off. The coach's own tile has no such fallback
(the screen leaves it blank while a camera is starting), so the fake
hands it a canvas painted with their initials, drawn mirrored because
the screen mirrors a self-view; the run asserts the tile is still
mirrored, so that compensation cannot rot silently.

**Two determinism traps live in this shot**, both now handled, and both
worth knowing before changing anything here:

- The live dot pulses forever (`SessionRoom.css:185`), so the capture
  landed at a different opacity each run. Every shot is now taken with
  `animations: 'disabled'`, which rewinds an infinite animation to its
  first frame and runs a finite one to its last.
- A canvas feeding a `<video>` stops emitting when it stops changing, so
  it is repainted on a timer and then frozen once the element has a
  frame. Frames still arriving during a capture change the bytes.

I first blamed the `<video>` for the non-determinism and that was wrong;
it was the dot. With animations frozen the video track hashes the same
every run.

**13 and 14 are captured in Arabic too, since #118.** They were English
only while `PreviewProfile` and `ClientCoach` printed
`coach_profiles.title` and the language list raw, so in Arabic they read
"Life coaching" and "English" under an Arabic name — the same stored value
Discover translated correctly. That was [#95]
(https://github.com/ahmedtahoun/rafiq-app/issues/95).

Both screens go through `coachLabels.ts` now. Verified before lifting the
restriction rather than taken on trust: `tests/coach-labels.spec.js` pins
the Arabic chips on `PreviewProfile` (`التدريب الحياتي`, `التدريب المهني`,
and Arabic language names), and `ClientCoach` renders its title through
the same helper at `ClientCoach.tsx:192`. The captures themselves were
then read to confirm no English is left in them.

That takes the set from 56 files to 60.

## How reproducible this actually is

It is a claim, so check it rather than trust it:

```sh
npm run screenshots && find store/screenshots/out -name '*.png' | sort | xargs sha256sum > /tmp/a
npm run screenshots && find store/screenshots/out -name '*.png' | sort | xargs sha256sum > /tmp/b
diff /tmp/a /tmp/b
```

**The honest answer, measured on 2026-10-05 over four runs of the 60-file
set: three were byte-identical and one differed in a single file**
(`02-coach-members`, by about 100 bytes in a 360 KB PNG — not a visible
difference). On top of that, regenerating the set in a fresh container
rewrote `04-coach-schedule` and `07-coach-messages` in all four
language/size combinations, by a similar margin, with no app change
between them.

So: the content is deterministic — the clock is pinned, the data is
seeded, animations are frozen — but the *encoding* is not quite, and it
varies more across environments than within one. This README used to say
"the same bytes on every run", which three consecutive clean runs had
supported at the time. Four runs and a container change were enough to
disprove it.

**What that means in practice.** A changed PNG in `git status` after a
regeneration is not by itself evidence of anything; look at the image.
Treat a diff as real when it is large, when it is the same file every
time, or when you can see it.

Two earlier breaks were real and were fixed, both invisible in a single
run: the pulsing live dot (above), and `02-coach-members`, which differed
on about one run in three because an avatar had not finished decoding
when the shutter fired. `document.fonts.ready` covers text and
`__screenSettled` covers the chunk; neither waits for an `<img>`, so the
run awaits `img.decode()` too. That took 02 from roughly one run in three
to one in four here — better, and not solved. If it matters enough to
chase, the remaining suspect is PNG encoding rather than page state,
since the byte delta is far too small to be a missing avatar.

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

**Bookings are seeded the way the database writes them.** 0010/0011
insert a booking as a pair — a `booked` time_block whose `label` is
`'Session · ' || <member name>`, plus a `sessions` row carrying its
`time_block_id` — and a `standard` session runs 50 minutes, an `intro`
20 (0010:69). An earlier seed wrote blank labels and hour-long slots, so
Schedule fell back to `t('schedulePreferredHours')` for anything not
`busy` (Schedule.tsx:254) and every booking read "Preferred hours · 50
min" on a 60-minute block: the coach's availability, not a session with
a person, and the length disagreeing with itself. A blank label is right
for exactly one kind, `busy`, which reads as "Unavailable".

**The Arabic shots show the English word "Session".** That is the stored
value: 0010 writes `'Session · '` whatever language the coach uses, and
the screen renders `label` raw. It is an app bug, Ahmed is fixing it,
and the seed deliberately does not work around it by writing an Arabic
label the database would never contain.

Three deliberate choices worth knowing:

**The coach has an avatar.** `shots.mjs` draws an initials avatar onto a
canvas and serves it as the coach's uploaded photo. Without one, Home
shows the new-coach setup checklist ("Set up your account, 3 of 4")
instead of the running practice, because the profile step wants a photo
and a bio. The drawn avatar is nobody's face, and a coach who uploads a
plain avatar is ordinary — so the screen is both the stronger image and a
state that can really exist.

**One member is archived, so the roster is 2 active of 3.** 0020 caps
the free plan at three *active* members, and at the cap the Members
screen shows "Free plan: 3/3 active members used — upgrade to Rafiq Pro
Plus for unlimited". Rafiq Pro Plus is a "Coming soon" screen
(`Subscription.tsx:156`) and `store/listing.md` is explicit that the
listing may not promise paying in the app until §3 lands — so a
screenshot carrying that banner would advertise a purchase nobody can
make. An archived member still appears under the default filter, badged
Inactive, so the roster is no thinner and a lapsed member is an ordinary
thing for a coach to have. The cost is that Home now reads "2 of 2
members paid up" instead of showing a payment due; if §3 ships and the
upgrade becomes real, make all three active again and the banner is
fine.

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
