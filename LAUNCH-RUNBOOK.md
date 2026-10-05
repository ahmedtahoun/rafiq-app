# Launch runbook — what to do, in what order

Three documents, three jobs. `LAUNCH-CHECKLIST.md` says **what** is left.
`RELEASE.md` says **how** a build reaches TestFlight and Play. This one
says **in what order**, and which steps have to wait on which — because
half of what is left is console work whose dependencies are not obvious
from any single list, and three of the waits are measured in days.

Written 2026-10-05. Everything here is Ahmed's: accounts, money, DNS and
a phone. Nothing in it is a code change except the two marked *(small PR)*.

---

## The shape of it

The thing that decides the launch date is not the work. It is **the
14-day Google Play closed test**, which cannot start until an Android
build is in a testing track, which cannot happen until Play's *App
content* section is complete, which needs a **public privacy policy URL**.

So the first afternoon's job is hosting the site. It unblocks the Play
clock and the Google sign-in fix at the same time, and it is the cheapest
item on the list — the pages are written, built and committed.

```
   host the site ──┬──► OAuth consent screen → In production
                   │      (fixes reviewer sign-in)
                   │
                   └──► Play: App content ──► build in a testing track
                                                      │
                                                14 days ⏳
                                                      │
                                                   submit
```

Everything else — crisis numbers, the device pass, the privacy forms, the
lawyer, the review accounts — fits inside those 14 days if the clock is
started first. Do it the other way round and they are serial.

## Waits you do not control

Start these early; they are the only things that cannot be hurried.

| Wait | How long | Starts when |
|---|---|---|
| Play developer account identity verification | days | You create the account |
| Play closed testing, **personal account only** | **14 days, 12 testers** | A build is in the closed track |
| Google OAuth brand verification, *if triggered* | days to weeks | You submit the consent screen |
| DNS / DMARC propagation | hours | You add the records |
| TestFlight external beta review | ~1 day | First external build |
| App Review (both stores) | ~1 day, sometimes longer | Submission |
| Lawyer reading the policy and terms | ask them | You send it |

**The OAuth one has a trap.** Uploading a logo to the consent screen, or
asking for a sensitive scope, puts the app into Google's brand
verification queue, which is slow and opaque. Rafiq only needs email and
profile, which are not sensitive. **If you can live without a logo on the
sign-in screen for v1, leave it off** and the move to "In production"
is immediate. Add it in a later pass.

---

## 0. Decide these first — each one changes the work

- [ ] **Personal or organization Google Play account.** An organization
      skips the 12-testers / 14-days rule entirely, which is the single
      biggest lever on the launch date. It needs a registered entity and
      a D-U-N-S number, which has its own lead time. Decide before you
      create the account: changing it later means a new account.
- [ ] **The legal entity** that owns both developer accounts and receives
      payouts (checklist §1). Gates the Play decision above.
- [ ] **112 or 123** for the emergency row (`research/crisis-lines.md` §1).
      112 matches the copy as written; 123 is what people know.
- [ ] **Does v1 sell anything?** Today: no. `Subscription.tsx` shows
      "Coming soon", there is no IAP or Play Billing dependency, and
      payments are recorded offline. Keeping it that way means the App
      Store **Paid Apps** agreement, tax forms, banking and the Play
      payments profile are all *not needed yet* — a real saving. Confirm
      it is deliberate, then skip those four rows in §5.

---

## 1. Host the site — do this first

Full instructions in `site/README.md` ("Cloudflare Pages, start to
finish"). The short version: Pages → connect this repo → **no build
command**, output directory `site/public` → add both `rafiqpro.com` and
`www.rafiqpro.com`.

**Verify before moving on.** All ten pages, not just one:

```sh
for p in "" ar/ privacy/ ar/privacy/ terms/ ar/terms/ \
         support/ ar/support/ delete-account/ ar/delete-account/; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://rafiqpro.com/$p")" "/$p"
done
curl -s -o /dev/null -w 'www → %{redirect_url}\n' "https://www.rafiqpro.com/privacy/"
```

Ten `200`s, and the last line landing on the bare domain. If the www
redirect does not work, `site/README.md` has the Cloudflare Redirect Rule
fallback — that form was never verified from the sandbox, so expect to
need it.

**Produces** the four URLs everything downstream asks for:

| | |
|---|---|
| Privacy policy | `https://rafiqpro.com/privacy/` (and `/ar/privacy/`) |
| Terms | `https://rafiqpro.com/terms/` |
| Support | `https://rafiqpro.com/support/` |
| Account deletion | `https://rafiqpro.com/delete-account/` |

## 2. The three things that need the site live

Do all three the same day.

- [ ] **Google Cloud → OAuth consent screen → "In production."** App
      name, authorized domain `rafiqpro.com`, home page, privacy policy
      and terms URLs. No logo, per the trap above. Google may want the
      domain verified in Search Console first.
      **Why this matters more than it looks:** in "Testing", sign-in
      works only for listed test users and their sessions expire after 7
      days. A reviewer is not on that list, so they hit a wall on the
      first screen. This is the most likely cause of a rejection that
      looks inexplicable.
- [ ] **Supabase → paid plan.** Free projects pause after a week idle,
      and a paused database during review is a rejection. While you are
      there: turn on backups, set the **Site URL**, and add
      `app.rafiqie.coach://auth-callback` to **Auth → URL Configuration →
      Redirect URLs** — native sign-in has never completed end to end
      (CLAUDE.md), and this is why.
- [ ] **Support mailbox `support@rafiqpro.com`**, able to *send*, not
      only receive. Both privacy policies, both store listings and the
      app point at it. Add the provider's SPF, DKIM and DMARC records,
      then send yourself a test from it and check it does not land in
      spam.

## 3. Store accounts and records

Needs the entity decision from §0.

- [ ] **Google Play Console** — create the account (identity verification
      starts its clock here), then the app.
- [ ] **App Store Connect** — the app record for `app.rafiqie.coach`.
      Then put its Apple ID into `APP_STORE_ID` in `src/lib/support.ts`
      *(small PR)*; until that lands, "Rate Rafiq" is hidden on iOS.
- [ ] **Apple private relay** — register `support@rafiqpro.com` under
      Apple Developer → Services → Sign in with Apple → Email
      Communication. Without it, mail to anyone who chose "Hide My Email"
      is silently dropped.
- [ ] Skip the Paid Apps agreement, tax, banking and the Play payments
      profile while v1 sells nothing (§0).

## 4. Sign and build — start the clock

`RELEASE.md` has all of this; the order that matters is **keystore before
first Android build**, and **ASC record before first iOS upload**.

- [ ] **Android upload key**, once ever. `RELEASE.md` §2. Back up the
      `.jks` *and* the password somewhere that survives the Mac — a
      password manager entry with the file attached. Losing it means days
      of waiting on Google to reset it.
- [ ] **iOS**: the Apple ID in Xcode must be an Admin on team
      `55BRQ92599`, or the first archive cannot create the distribution
      certificate.
- [ ] `npm run app-version -- 1.0.0 1`, then build and upload both.
- [ ] **Play → Internal testing** first, accept **Play App Signing** on
      the first upload.

## 5. Play's "App content" — the gate on closed testing

This is the step most likely to surprise you, and the one I could least
verify from here (`support.google.com` is blocked by this sandbox's
egress proxy — treat the gating as "check it in the console", not as a
quoted rule). Play will not let a build out to a testing track until the
App content section is complete:

| Declaration | Where the answer already is |
|---|---|
| Privacy policy URL | §1 above |
| Data safety | `store/play-console.md` §7 — **q13 is still open**, see below |
| Content rating (IARC) | `store/play-console.md` §3 — fully answered |
| Target audience | `store/play-console.md` §4 |
| Ads | `store/play-console.md` §2 — none |
| Government / financial / health app declarations | §§8–10 |
| Advertising ID | §11 — not used |
| Account deletion URL | `https://rafiqpro.com/delete-account/` |

**q13** is whether a 1:1 video session needs a row for audio and video on
the Data safety form. `store/play-console.md` sets out options A and B
with a recommendation and could not be settled from this sandbox. Decide
it before you fill the form; it is the only unanswered question in there.

- [ ] Once App content is complete: **promote to closed testing** and
      recruit the 12 testers. **The 14 days start now.** Everything below
      happens while that runs.

## 6. During the 14 days

None of these blocks the others.

- [ ] **Dial the five crisis lines.** `research/crisis-lines.md` has a
      candidate and sources per row, what to ask, and the shape of the
      edit. This is the last 🔴 in the app itself.
- [ ] **The real-device pass.** `store/review-notes.md` §2: both roles,
      English on iPhone, Arabic on Android, one of them in dark mode, on
      the store build and not a local one. Nobody has ever run this app
      on a physical phone.
- [ ] **Two review Google accounts**, 2-Step Verification off, then
      `supabase/admin/review-accounts.sql` to give them real data
      (`review-notes.md` §1).
- [ ] **Apple's App Privacy form** from `store/app-privacy.md` §8.
- [ ] **Apple's age rating questionnaire** — the one form nothing in the
      repo answers yet. `app-privacy.md:366` assumes 12+; the
      questionnaire itself is unanswered.
- [ ] **Store listing** — text and screenshots are done
      (`store/listing.md`, `store/screenshots/`). `listing.md`'s "Still
      needed" section is stale about screenshots: there are 12 per
      language on `main`, plus the feature graphic and both icons (PR
      #127 adds two more). What is genuinely still open there is the
      category, the Arabic keywords, and whether to say "starting in
      Egypt".
- [ ] **Lawyer** on the policy and terms, and `AGREEMENT_TEXT`.
- [ ] **Deploy the admin tool** so reports can actually be acted on.
      Apple and Google both require reporting, blocking *and* timely
      action; the first two ship already and the third is a deploy —
      `admin/` plus `supabase/functions/admin/`, steps in
      `admin/README.md`.
- [ ] **Write down a response time** for reports (checklist §9). Deletions
      already promise 30 days on the public page; reports promise
      nothing, and "timely action" is the word both stores use.
- [ ] **Launch coaches.** Discover opens with "the marketplace is still
      filling up". Shipping the member half empty is a product decision,
      not a bug, but it is a decision.

## 7. Submit

- [ ] `npm run build && npm run lint && npm test` and the schema suite
      green in CI, on the exact commit you build.
- [ ] Bump the build number — it must rise even after a rejection.
- [ ] Apple: App Review Information from `store/review-notes.md` §3.
      Google: App access from §4. Sign-in is Google and Apple only, so a
      reviewer cannot get past the first screen without the accounts.
- [ ] Phased release on Apple, staged rollout on Play.
- [ ] Tag the commit: `git tag v1.0.0-1 && git push origin v1.0.0-1`.

---

## What I could not check from here

The sandbox's egress proxy blocks `support.google.com` and
`play.google.com`, so every claim above about **what Play requires and in
what order** is reasoning from the repo's own notes and from
`developer.android.com`, not a quoted policy. The three worth confirming
in the console on day one, because they move the date:

1. Whether App content must be complete before an **internal** track, or
   only before a **closed** one.
2. Whether the 12-testers / 14-days rule still applies in its current
   form, and exactly what an organization account skips.
3. Whether a logo on the OAuth consent screen still triggers brand
   verification.

If any of the three turns out differently, this document's order is
wrong, not just its detail — tell me and I will redo it.
