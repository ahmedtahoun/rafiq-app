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
Arabic because it starts with a digit.

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

**Calendar maths runs on a fixed fictional week, not the wall clock.**
`TODAY_MS = Date.UTC(2025, 9, 22)` — Wednesday 22 October 2025.
`WEEK_START_MS` is two days earlier, so the visible week is Mon 20 – Sun 26
and today sits at index 2. Screens hardcode `const TODAY_INDEX = 2`
locally. Anything date-dependent must anchor to these, or it drifts with
the real date and the seeded demo data stops making sense.

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

## Not verified

Nothing native has ever run on a device or simulator — no Xcode, no Android
SDK in any environment used so far. The iOS and Android shells are
configured but unproven. Native sign-in also needs
`app.rafiqie.coach://auth-callback` added to Supabase → Auth → URL
Configuration → Redirect URLs, which has to be done in the dashboard by
hand.
