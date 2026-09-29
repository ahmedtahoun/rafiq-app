# Working on Rafiq

Read `README.md` for the stack and layout, and `WORK-SPLIT.md` for what is
built, what is left, and the branch/PR agreement. This file is the rest:
the conventions that are easy to break and the traps that have already
cost someone a debugging session.

## Commands

```sh
npm run dev      # Vite dev server on :5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint — must be silent, not just exit 0
npm test         # Playwright browser suite (starts its own dev server)
```

CI runs all four plus the Postgres schema suite. Run them before pushing;
`npm test` is the slow one at ~3 minutes, and it is the only check that
looks at a rendered screen.

`.env.local` holds a real Supabase URL and anon key and is gitignored.
Never commit it. The tests do not need real credentials — see
`tests/README.md`.

## The traps

**A blank screen is almost never your code.** If a screen you just wrote
renders empty, or every test suddenly reports zero elements, it is a stale
Vite module cache:

```sh
pgrep -f 'v[i]te' | xargs -r kill    # NOT pkill -f vite: it matches its own shell and kills it
rm -rf node_modules/.vite
npm run dev
```

This has cost time three separate times. Check it before you start
bisecting.

**Typecheck and lint prove almost nothing about a screen.** Every real bug
found in this codebase so far passed `tsc` and `oxlint`: Arabic text
reordered into nonsense, a rating written to the wrong row, an icon
mirrored twice, a screen that rendered blank. Open the app, in both
languages, before calling anything done — or add a test that does.

## Arabic and RTL

The app is fully bilingual and the Arabic side is where the bugs are.

**Use CSS logical properties.** `inset-inline-start`, `margin-inline-end`,
`padding-block` — never `left`/`right`. RTL then mirrors for free.

**Do not hand-flip directional icons.** `tokens.css` already has
`[dir='rtl'] .icon-directional { transform: scaleX(-1); }`. Adding your own
`scaleX(-1)` flips it twice and it points the wrong way. Use
`ArrowForwardIcon` for forward chevrons and `ChevronIcon` for back ones,
and let the class do it.

**Wrap user content in `<bdi>`.** Any string the app did not write — a
member's name, a task title, a pro's specialty — needs `<bdi>` when it sits
in a translated sentence. Without it, bidi reordering moves it: a task
called `10-minute evening walk` rendered as `minute evening walk-10` in
Arabic because it starts with a digit. When the string goes *into* `t()` as
a param, there is no element to wrap — pass `isolate(value)` from
`i18n.ts` instead (`t('clientBookingOffering', { name: isolate(o.name) })`).

**Isolate each end of a range separately.** One `dir="ltr"` around a whole
time range scrambles it once AM/PM is an Arabic word —
`10:00 AM – 10:45 AM` came out as `صباحًا 10:45 – 10:00 صباحًا`. Give each
end its own `<bdi>` and leave the container alone.

## Copy and i18n

All copy lives in `src/lib/i18n.ts`, EN and AR side by side.

**Keys are compile-checked.** `MessageKey` is derived from the English
dictionary, so a typo at a call site, a key added to `en` and forgotten in
`ar`, and a key in `ar` that `en` lacks are all `tsc` errors. You do not
need to verify parity by hand — but you do need to add both languages.

**Build keys through a helper, not by string concatenation.** Indexed keys
go through `dayKey('dowShort', i)`; lookup tables are typed
`Record<Thing, MessageKey>`. A key assembled with `+` or a template
literal escapes the check.

**Reuse a key before adding one.** `back`, `switchLanguage`, `close`,
`toggleDarkMode`, `notifications` are shared. Screen-scoped duplicates of
the same control drift: two screens once had "Toggle theme" and "Toggle
dark mode" for the same button.

**Every `aria-label` comes from `t()`.** Icon-only buttons carry their whole
meaning there, and an English literal is invisible until someone runs a
screen reader in Arabic. If the control sits in a list, interpolate what it
acts on — "Toggle complete: {task}", not a bare "Toggle task complete"
repeated once per row. `tests/a11y-labels.spec.js` enforces all of this.

**Do not let copy claim something the app does not do.** The onboarding
carousel promised everything happened "over WhatsApp" long after in-app
messaging shipped and the privacy policy said otherwise. If you change
where data goes, grep the copy.

## Data layer

`src/lib/mockStore.ts` is the whole data layer, backed by `localStorage`
under a `rafiq_` prefix, written as drop-in Supabase seams. `directory.ts`
is the same for the marketplace side.

**Signed out, calendar maths runs on a fixed fictional week.**
`TODAY_MS = Date.UTC(2025, 9, 22)` — Wednesday 22 October 2025.
`WEEK_START_MS` is two days earlier, so the visible week is Mon 20 – Sun 26
and today sits at index 2. Screens still on the demo clock hardcode
`const TODAY_INDEX = 2` locally. Anything date-dependent on that path must
anchor to these, or it drifts with the real date and the seeded demo data
stops making sense.

**Signed in, the converted screens are on the real clock** — the coach's
roster and Schedule, AddTimeBlock, the member's space, and the accept
flow. They take "today" from `wallTodayMs()` or their store's `todayMs`,
and the week from `weekdayOf(todayMs)`, never `TODAY_INDEX`. Which screens
are still on the demo clock is one grep: `TODAY_INDEX` (ClientSchedule,
ClientBooking and CoachPreview move with the member's own calendar,
SUPABASE-MIGRATION-PLAN.md step 4).

**One month grid, `getMonthGrid()`.** Both arguments default to the demo
week, so a screen on the fixed clock calls it bare and a real one passes
`(todayMs, weekStartMs)`. They are separate on purpose: a real week
straddles a month boundary twice a year, and then which month to draw and
which seven days are live disagree. There were three implementations of
this grid at one point — don't add a fourth.

**Display every date and time through `src/lib/format.ts`.** Calendar
values are built with `Date.UTC`, so their UTC fields *are* the wall-clock
time — a 6 PM task is stored as 18:00 UTC. `format.ts` formats in UTC and
in the app's language. A bare `toLocaleTimeString()` / `toLocaleDateString()`
/ `Intl.DateTimeFormat` without `timeZone: 'UTC'` renders in the device's
zone instead, and every time in Egypt comes out three hours late ("9:00 PM"
for a 6 PM task). This shipped twice before it was caught. The browser
tests run in `Africa/Cairo` (`playwright.config.ts`) so it shows up there,
not only on a phone. Store timestamps, never display strings — `Task.due`
and `Client.nextSession` were both English sentences once.

**Two kinds of time, two formatters.** Which one depends on where the value
came from, not on what it looks like:

- *Calendar values* — anything on the fixed week (tasks, sessions,
  availability, mockStore dates). Wall-clock time in UTC fields: use
  `fmt.date` / `fmt.time` / `fmt.taskDue`, which format in UTC.
- *Real instants* — a moment Supabase recorded (`created_at`, `sent_at`,
  `settled_at` on `payouts`; any `timestamptz` the server stamps). Use
  `fmt.instantDate`, which formats in the device's zone. Through the UTC
  formatters, a payout made at 1 AM in Cairo shows the day before.

The test suite runs in `Africa/Cairo`, so mixing them up shows as a wrong
date there (`tests/payout-history.spec.js` checks one across midnight).

**Real rows a screen treats as calendar values** — a task's `due_at`, a
session's `scheduled_at` — are converted at the data layer's edge by
`src/lib/wallClock.ts` (`toWallMs` reading, `fromWallMs` writing), so the
calendar formatters and comparisons work on them unchanged. What changes is
"today": such a screen takes `todayMs` from `useRoster()` (the real day
signed in, `TODAY_MS` signed out) and passes it to `isTaskOverdue`,
`fmt.taskDue` and `fmt.nextSession`. Never mix `TODAY_MS` with real rows —
every real task would read as not due until 2025's fixed week catches up.

**`readLocal` does not validate shape.** It parses whatever is stored and
casts it to the expected type, so a value written by an older version
crashes the first screen that iterates it. Worth knowing when you change a
stored shape; there is a test that relies on this
(`tests/error-boundary.spec.js`).

**Check the function exists before building on it.** Several screens were
written against a brief that described functions `mockStore` did not have,
or fields with different names (`SessionLog` has `atMs`/`attendance`, not
`date`/`note`). Read the module, do not trust the description.

## Routing

`src/store/appStore.ts` holds a flat `Screen` union and `nav()` / `back()`.
Adding a screen means four things: the union member, an `App.tsx` switch
arm, a `PARENT` entry so `back()` has somewhere to go, and `ROOTS` if it is
a tab root. Miss the `PARENT` entry and the back button dead-ends.

Deep-linking a screen that reads `params` (e.g. `coachPreview` needs
`coachId`) renders its empty state without them — that is correct
behaviour, not a bug, and tests have to pass the params.

## Tests

`tests/README.md` covers running them and how they reach into the app.
Two rules worth repeating here:

- **A test that cannot fail is not a test.** After writing one, break the
  thing it covers and watch it go red — against a freshly restarted dev
  server. Mutating a file under a running one leaves its module graph
  half-updated and the suite reports a far wider blast radius than the
  change caused. A run that takes minutes instead of seconds is the tell.
- **When a test fails, work out which side is wrong.** Several times the
  expectation was wrong and the app was right. Fix the test in that case,
  and say so rather than quietly changing the assertion.

## Native builds

Both apps have been built and run: iOS on the iPhone 17 Pro Max simulator
and Android on an emulator, 2026-09-29. **Not yet on a real phone, and
native sign-in has not been completed end to end** (the in-app browser
opens Google's and Apple's pages; nobody has signed in through them yet).
Native sign-in needs `app.rafiqie.coach://auth-callback` in Supabase →
Auth → URL Configuration → Redirect URLs.

```sh
npm run build && npx cap sync          # every time the web app changes
# iOS: Swift Package Manager, no CocoaPods
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build
# Android: needs Java 21. Android Studio's bundled Java 25 fails with
# "Unsupported class file major version 69".
JAVA_HOME=<a JDK 21> ./gradlew assembleDebug    # in android/
```

`npm run build` bakes `.env.local`'s Supabase settings into the app, so a
local native build talks to the live project.

Known from the first run: on iPhone the onboarding screens' Skip and back
buttons sit under the status bar, where iOS swallows taps — Skip does
nothing. Screens need `env(safe-area-inset-*)` (LAUNCH-CHECKLIST §4).
On the simulator, very short injected taps don't reach the web view; that
is the tool, not the app.
