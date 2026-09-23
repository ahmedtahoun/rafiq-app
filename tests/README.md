# Browser tests

These drive the real app in Chromium and assert on what a user would see.

That is deliberate. `tsc -b` and `oxlint` pass cleanly on every bug this
suite has caught so far: Arabic text scrambled by bidi reordering, a
rating written to the wrong session row, an icon mirrored twice in RTL, a
screen that rendered blank. None of those are type errors, and nothing
else in CI looks at a rendered screen.

## Running them

```sh
npm test            # headless, all suites
npm run test:ui     # Playwright's watch UI
npx playwright test tests/reviews.spec.js    # one suite
npx playwright test -g "milestone"           # one test by name
```

`playwright.config.ts` starts the Vite dev server itself and waits for it,
so there is nothing to launch first. Locally it reuses a dev server you
already have running on port 5173.

### Sandboxes with a pre-installed browser

Some environments ship a Chromium build at a fixed path and block the
download Playwright would otherwise do. Point `PW_CHROMIUM` at it:

```sh
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test
```

CI installs the build its Playwright version expects, so it needs no
override.

## How they reach into the app

The suites talk to the dev server rather than a production build, which
lets them import the app's own modules through Vite's module graph:

```js
await page.evaluate(async () => {
  const m = await import('/src/lib/mockStore.ts');
  m.addCustomBlock({ clientId: 'sara', dayIndex: 3, startH: 10, endH: 10.75 });
});
```

That matters because a lot of the interesting states have no path through
the UI — a session inside the 12-hour cancellation grace window, a program
finished but not yet reviewed, a relationship that has been blocked. The
tests seed the state directly and then assert on the rendered screen.

Each test opens its own browser context and clears `localStorage` first,
so they are independent and run in parallel.

## Why JavaScript and not TypeScript

The specs are `.js`. They were written and verified as scripts, and
porting them to TypeScript would have meant annotating several hundred
lines of test glue whose only real contract is "this runs in a browser" —
the app modules they import are resolved by Vite at runtime, not by tsc.
The app itself stays strictly typed; these check its behaviour, and the
way they are checked is by running.

## Conventions worth keeping

- **Assert on a real bug, not on markup.** A test that only says "this
  div exists" fails on a refactor and passes on a regression.
- **Console errors are failures.** Every suite collects `pageerror` and
  `console.error` and asserts the list is empty. A screen that renders but
  warns is not a passing screen. Sandbox noise is filtered in
  `helpers.js` and nowhere else.
- **Check both languages.** Most of the bugs found here only appeared in
  Arabic.
- **When a test fails, work out which side is wrong.** Several times the
  expectation was wrong and the app was right; fix the test in that case,
  and say so.

## If every test suddenly fails with nothing rendered

Almost always a stale Vite cache, not a broken app — the give-away is
element counts of `0` everywhere at once rather than a handful of real
assertion failures. Restart the dev server clean:

```sh
pgrep -f 'v[i]te' | xargs -r kill      # not pkill: it matches its own shell
rm -rf node_modules/.vite
npm run dev
```

CI never hits this because it starts a fresh server every run.
