# Google Play Console — every answer, in the order Play asks

For Ahmed to review and paste in. **Nothing here is submitted by anyone
but you**, and the eleven questions this document cannot answer are
listed at the end rather than guessed at.

Worked out from `store/privacy-inventory.md` (which was itself read out
of `supabase/migrations/0001`–`0020` and the app's own code),
`store/review-notes.md`, and `LAUNCH-CHECKLIST.md`. Where a section here
disagrees with the inventory, the inventory is the source — tell me and
I will fix this file.

> **The help-page links are unverified.** `support.google.com` is blocked
> from the sandbox this was written in, so every URL below is cited from
> memory by its exact title. Search the title in Play Console's help if a
> link 404s, and tell me so I can correct it. The *titles* are what
> matter; Google renumbers answer IDs.

**Play Console → App content** lists these in order. Everything in it
must be green before a production release.

---

## 0. Privacy policy

*Help: "Provide a privacy policy" — https://support.google.com/googleplay/android-developer/answer/9859455 (unverified)*

**URL:** `https://rafiqpro.com/privacy/`

Blocked on hosting the site (§5). The page exists and is built
(`site/public/privacy/`, EN and AR), and `npm run build:site`
regenerates it from the app's own copy so the two cannot drift.

Play requires the policy to be reachable from a public URL, non-editable
by users, and to cover the same data the Data safety form declares. Our
policy has two halves, one per role, which is fine — link the root
`/privacy/` page, which offers both.

---

## 1. App access

*Help: "Provide app access instructions" — https://support.google.com/googleplay/android-developer/answer/9859455 (unverified)*

**Answer: "All or some functionality is restricted."**

Sign-in is Google or Apple only, so a reviewer cannot see anything
without an account. Add two instruction sets (the wording is
`store/review-notes.md` §4, reproduced so you can paste from one place):

| Field | Coach | Member |
|---|---|---|
| **Name** | Coach | Member |
| **Username** | `PLACEHOLDER — coach review account email` | `PLACEHOLDER — member review account email` |
| **Password** | `PLACEHOLDER` | `PLACEHOLDER` |
| **Any other information** | "Choose Continue with Google, sign in, and pick 'I'm a Pro'." | "Choose Continue with Google, sign in, and pick 'I'm a Member'." |

**Placeholders are deliberate.** No credential goes in this repository.
Create the two accounts, put them straight into Play Console, and keep
them in your password manager.

Three things `store/review-notes.md` says that matter here:

- **Neither review account may have 2-Step Verification on.** Reviewers
  sign in from their own devices and will be locked out by it.
- Both accounts need **real content in them** — a roster, sessions,
  tasks, messages. Signed out the app shows an empty marketplace since
  #101 removed the fictional coaches, so an empty account demonstrates
  nothing.
- The two accounts must be **linked to each other** (the coach has the
  member on their roster), or neither side shows a relationship.

---

## 2. Ads

*Help: "Declare whether your app contains ads" — https://support.google.com/googleplay/android-developer/answer/9859455 (unverified)*

**Answer: No, my app does not contain ads.**

Certain: there is no ad SDK, no ad network, and no advertising
identifier in the project. `store/privacy-inventory.md` §11 lists every
third party that receives anything — Supabase, Google and Apple
sign-in, Paymob, and Sentry once a DSN is set — and none is an ad
network.

This answer must stay consistent with **Advertising ID** (§11 below) and
with Data safety's "Is this data used for advertising or marketing?",
which is No for every row.

---

## 3. Content rating (IARC questionnaire)

*Help: "Complete the content ratings questionnaire" — https://support.google.com/googleplay/android-developer/answer/9859655 (unverified)*

The questionnaire is filled once and IARC issues ratings for every
territory. Answer as the **"Social Networking / Communication"**
category, not Utility — the app has user-to-user messaging, and
choosing the lighter category with messaging present is the usual way
this gets re-rated later.

| Question | Answer | Why |
|---|---|---|
| Violence, realistic or cartoon | No | |
| Sexual content or nudity | No | |
| Profanity or crude humour | No | None in the app's own copy |
| Controlled substances (drugs, alcohol, tobacco) | No | |
| Gambling, simulated or real | No | |
| Horror or fear themes | No | |
| Does the app let users interact or exchange content? | **Yes** | Coach↔member messaging (`0014`), and members can post reviews on a coach's page |
| Can users share their location with other users? | No | No location is collected at all; city is self-typed text and is not shared between users |
| Can users exchange personal information? | **Yes** | A free-text message can contain anything the two people type |
| Does the app share user-provided personal information with third parties? | No | §11: processors only, no recipient with its own purpose |
| Does the app contain user-generated content that is visible to others? | **Yes** | Reviews on a coach's public page, signed first name + last initial |
| Is there an in-app purchase? | **No, today** | Nothing is purchasable; Rafiq Pro Plus is a "Coming soon" screen (`Subscription.tsx:156`). **Re-answer when §3 ships.** |
| Digital purchases of real-world goods/services | No | Booking sends a request; nothing is charged in the app |

**Expected outcome:** PEGI 3 / ESRB Everyone / USK 0 with an
"Users interact" and "Shares info" interactive-elements notice. That
notice is normal for any app with chat and is not a problem.

**Moderation, which the questionnaire and policy both assume:** reporting
exists (`pro_reports`), blocking exists from either side (`0014`), and
acting on reports is the admin tool in #98. Have that deployed before
you submit — Apple requires the same three and Google's UGC policy
expects them.

---

## 4. Target audience and content

*Help: "Target audience and content" — https://support.google.com/googleplay/android-developer/answer/9285070 (unverified)*

| Question | Answer |
|---|---|
| Target age groups | **18 and over, only.** Tick no box below 18. |
| Is the app appealing to children? | **No** |
| Does the store listing or app content appeal to children? | No — adult coaching, adult imagery, no play mechanics |

Selecting any under-18 band pulls the app into **Families policy**:
Designed for Families requirements, a children's privacy policy, and
restrictions on data collection that this app would fail (it collects
health data and messages). Coaching is an adult service; keep it 18+.

The listing should not imply otherwise. `store/listing.md` has no
child-directed copy and the screenshots show adult users.

**Consistency check:** this must agree with the age rating from §3 and
with the policy's own statement. If a PEGI 3 rating sits next to an 18+
target audience, that is normal and expected — the rating is about
content, the target audience is about who it is *for*.

---

## 5. News apps

**Answer: No, this is not a news app.** No further questions.

---

## 6. COVID-19 contact tracing and status apps

**Answer: No.** Not a contact-tracing or status app. No further questions.

---

## 7. Data safety

*Help: "Provide information for Google Play's Data safety section" — https://support.google.com/googleplay/android-developer/answer/10787469 (unverified)*

The long one. Built row by row from `store/privacy-inventory.md`.

### The three answers that apply to every row

| Question | Answer | Why |
|---|---|---|
| Is all user data encrypted in transit? | **Yes** | Everything goes to Supabase over HTTPS; `ITSAppUsesNonExemptEncryption = NO` is set on the iOS side because it is standard HTTPS only |
| Do you provide a way for users to request their data be deleted? | **Yes** | In-app (Profile → delete account) **and** a web page at `https://rafiqpro.com/delete-account/`. Play requires the URL, not just the button — §6 of the checklist |
| Is any of this data used for tracking (as Play means it)? | **No** | `store/privacy-inventory.md` opening section: no advertising SDK, no analytics, no third-party identifier, never linked to another company's data |

### Data collected

For every row: **Collected = Yes, Shared = No, Processed ephemerally =
No, Required = Yes** unless the row says otherwise. "Shared = No"
because §11's third parties are processors acting on our instructions,
which Google's definition excludes from "shared" — Supabase is the
backend.

**Three rows are the exception, decided at q12: the Financial info rows
are Shared = Yes.** The processor exemption holds when a third party
acts only on your instructions, and Paymob does not: a regulated
financial institution uses a coach's national ID for its own KYC and
anti-money-laundering obligations, which is its purpose rather than
ours. Those rows are marked below.

#### Personal info

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| Name | Yes | App functionality, Account management | Required | `profiles.full_name`, from the sign-in provider or typed |
| Email address | Yes | App functionality, Account management | Required | `profiles.email` |
| User IDs | Yes | App functionality, Account management | Required | `profiles.id` (uuid), the auth user id |
| Phone number | Yes | App functionality | **Optional** | `profiles.phone`; a coach may add a member's |
| Address | **No** | — | — | Decided (q1): city and country are two optional self-typed fields, no street or postcode, nothing measured. Declared under **Other info** instead |
| Other info | Yes, **Shared** | App functionality | Required for coaches taking payouts | **National ID** on `coach_payout_accounts`. Google's "Other info" is the right box (Apple has no type at all — q5) |

#### Financial info

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| User payment info | Yes, **Shared** | App functionality | Optional (coaches only) | Wallet number or bank code + account number. These are details a coach is *paid to*, not pays with; it is still the only category that means "a financial account of the user's" |
| Purchase history | Yes | App functionality | Optional | `payments` — what a coach recorded a member as having paid, offline. **No in-app purchase exists** |
| Other financial info | Yes, **Shared** | App functionality | Optional (coaches only) | `payouts`: amount, issuer, destination snapshot, status |

#### Health and fitness

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| Health info | **Yes** | App functionality | Optional | **Mood check-ins** are not ambiguous: self-reported wellbeing, dated, tied to an identified account |
| Health info (coaching focus) | **Yes** | App functionality | Optional | Decided (q3): declared. Mood check-ins already force a Health declaration, so this costs nothing on the product page and buys accuracy |
| Fitness info (tasks) | **Yes** | App functionality | Optional | Decided (q4): declared. A task carries a `done` flag, so the app records whether the person did the exercise, not just that it was set |

#### Messages

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| Other in-app messages | Yes | App functionality | Optional | `messages`, coach↔member only. Not E2E encrypted — encrypted in transit and at rest, readable by the two parties and by `service_role` |

#### Photos and videos

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| Photos | Yes | App functionality | Optional | Profile and cover photos, private `avatars` / `covers` buckets, served by signed URL |

#### App activity

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| App interactions | Yes | App functionality | Required | Sessions, tasks, bookings, attendance — the coaching record itself |
| Other user-generated content | Yes | App functionality | Optional | Goals, recaps, notes, reviews, report text, offerings |
| Other actions | Yes | App functionality, **Fraud prevention and security** | Required | Reports and verification requests; the security purpose covers moderation |

#### App info and performance

| Data type | Collected | Purposes | Required? | Notes |
|---|---|---|---|---|
| Crash logs | **No today** | — | — | Sentry is built but off, and off means the SDK is never imported. **The day you set `VITE_SENTRY_DSN`, this becomes Yes** and this form must be updated before that build ships (§10) |

#### Not collected, worth being sure about

Location (no geolocation API is called; city is typed text) · Contacts ·
Calendar · Files and docs · Audio · Web browsing history · Installed
apps · Device or other IDs · **Advertising ID**.

---

## 8. Government apps

**Answer: No.** Not developed by or on behalf of a government.

---

## 9. Financial features

*Help: "Financial features declaration" — https://support.google.com/googleplay/android-developer/answer/13316080 (unverified)*

**Answer: "My app does not provide any financial features."**

This is the right answer *today*, and it is worth being precise about
why, because the app does touch money:

- **There is no in-app payment.** Booking sends the coach a request;
  nothing is charged (`store/listing.md` is explicit, and §3 of the
  checklist is still open).
- **"Mark paid" is a coach recording a payment they took elsewhere.** It
  writes a `payments` row. The app moves no money.
- **Coach payouts go out through Paymob**, from an admin-only Edge
  Function on the server. That is Rafiq paying its coaches, not a
  financial service offered to users in the app.

Play's categories here are banking, lending, crypto, and real-money
gaming. None applies.

**This answer changes when §3 lands.** Once Rafiq Pro Plus is sold
through Play Billing, re-open this section *and* the content rating's
in-app purchase question, and the listing's "Contains in-app purchases"
flag appears automatically.

---

## 10. Health apps

*Help: "Health apps declaration" — https://support.google.com/googleplay/android-developer/answer/12261419 (unverified)*

**Answer: Yes, this app has health features** — then the narrow
sub-answers below. Do not skip this one on the grounds that it is a
coaching app; Play's definition is broad and mood tracking is inside it.

| Question | Answer |
|---|---|
| Is it a health app? | **Yes** — it records self-reported wellbeing (mood check-ins) over time |
| Does it conduct clinical trials or research? | **No** |
| Is it a medical device, or does it make medical claims? | **No** |
| Does it provide diagnosis, treatment, or health advice from a licensed professional? | **No** — coaching is explicitly not therapy; the app says so in onboarding and the terms, and carries a crisis-resources screen |
| Does it handle health data? | **Yes** — mood check-ins; see Data safety |
| Mental health / crisis support features? | **It signposts, it does not provide.** `crisisResources.ts` lists services behind "Coaching is not therapy" |

**The thing to get right here:** the app must never read as a mental
health *treatment* service. "Coaching is not therapy or medical advice"
is already in onboarding and the terms (§8 ticks it), and the crisis
list exists. Keep the listing copy on the same side of that line —
`store/listing.md` already forbids therapeutic claims.

**Hard dependency:** the crisis numbers are still unconfirmed (§8, and
`crisisResources.ts` carries `phone: null` for every row until Ahmed has
dialled them). A health declaration alongside an unverified crisis list
is the combination worth not submitting.

---

## 11. Advertising ID

**Answer: No, my app does not use advertising ID.**

The app declares no `com.google.android.gms.permission.AD_ID`
permission and contains no SDK that would use one. Consistent with §2
(no ads) and with Data safety's tracking answer.

---

## 12. Countries, regions and pricing

*Help: "Set up prices and distribute your app to countries and regions" — https://support.google.com/googleplay/android-developer/answer/6334373 (unverified)*

Not part of **App content**, but asked before a production release.

| Field | Answer |
|---|---|
| Is the app free or paid? | **Free** — and this cannot be changed later. A free app can add in-app purchases (which §3 will); a paid app can never become free |
| In-app purchases | **No, today.** Becomes Yes when Rafiq Pro Plus ships through Play Billing |
| Countries and regions | **Egypt at launch.** See the note below |
| Contains ads | No |

**On countries:** the app is bilingual EN/AR, prices are in EGP
(`offerings.currency`), and the payout rail is Paymob, which is Egyptian.
Launching Egypt-only keeps the listing honest and the support load
answerable in two languages. The Gulf is the obvious second step and
needs no code change — but it does need a view on whether coaches
outside Egypt can be paid, which Paymob does not solve. **Open question
for you**, not for this document.

The listing's own text, in both languages, is `store/listing.md`.

---

## The questions, answered

Settled 4 October 2026. The full reasoning is in
`store/app-privacy.md` §8, which is the single record for both forms;
`store/privacy-inventory.md` carries the same answers. Summarised here
so this document can be filled in without opening the other two.

| # | Question | Answer | Effect here |
|---|---|---|---|
| 1 | City and country — Address or Other info? | **Other info.** No street, postcode or anything measured; "Address" overstates in the direction that alarms | Address row is **No** |
| 3 | Is coaching focus health data? | **Yes.** Mood check-ins already force a Health declaration, so this costs nothing and buys accuracy | Health info **Yes** |
| 4 | Are tasks fitness data? | **Yes.** A task carries a `done` flag — the app records whether the person did it | Fitness info **Yes** |
| 5 | Where does a national ID go? | **Other info** here; Apple has no type for it at all | Already declared |
| 11 | Switch crash reporting on? | **Yes, EU region (`de.sentry.io`), after launch**, in a release that updates both forms together | Crash logs stays **No** until the DSN is set |
| 12 | Paymob: shared or processed? | **Shared.** A regulated institution uses a national ID for its own KYC and AML duties — its purpose, not ours | Three Financial info rows → **Shared = Yes** |

### Still open, and what closes each

| # | Question | What settles it |
|---|---|---|
| 6 | Does Paymob genuinely require `national_id`? | **The staging payout run (§3).** `paymobPayouts.ts:84` enforces 14 digits, but that encodes a belief, not evidence. If the answer is no, q5 disappears and `0009` gets simpler |
| 9 | Supabase log retention | Confirm on the plan actually bought (~a week on Pro). Recommendation: say it in the policy, **do not** declare it on this form — host logs are not what it asks about |
| 2 | May a member see their coach's private notes? | Counsel. Assume yes; the exposure is that **coaches do not know**, which is a product change |
| 7 | Law 151/2020 and the transfer to Ireland | Egyptian counsel, on whether a Data Protection Centre permit is required and obtainable |
| 8 | A retention period | Proposed: account lifetime, plus five years for financial records, logs about a week. Confirm the five against Egyptian tax and commercial law |
| 10 | Age rating | An output, not a decision — answer the questionnaire honestly and keep target audience 18+ |

**A gap found while answering these:** nothing — not the policy, not the
deletion page, not the app — mentions **backups**. Supabase keeps
point-in-time backups, so a deletion does not purge data instantly, and
the deletion page's promise and the technical reality disagree for the
length of that window. Wording to fix it is in `store/app-privacy.md`
§9, alongside the transfer and retention text.

## Before you press publish

- [ ] The two review accounts exist, have content, are linked, and have 2-Step **off**
- [ ] The privacy policy URL resolves (needs §5, hosting)
- [ ] The deletion URL resolves — Play checks this one
- [ ] The admin tool is deployed, so reports can actually be acted on (#98)
- [ ] The crisis numbers are confirmed, given the health declaration (§8)
- [ ] Data safety matches the privacy policy, line for line. Play rejects on mismatch more often than on content
- [ ] If `VITE_SENTRY_DSN` is set in the build you are shipping, Crash logs is **Yes**

## Keeping this true

This file is downstream of `store/privacy-inventory.md`. That file says
how to tell when *it* has gone stale:

```sh
grep -n "create table" supabase/migrations/*.sql   # a new table is a new row
grep -rn "https://" index.html src/                # a new third party
```

A migration that adds a column holding something about a person changes
the inventory, and both store forms with it.
