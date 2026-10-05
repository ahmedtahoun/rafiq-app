# Apple App Privacy — every answer, in the order App Store Connect asks

For Ahmed to review and enter. The sister document to
`store/play-console.md`; the same facts, mapped to Apple's types rather
than Google's, because the two forms divide the same data differently
and answering one from the other is how they end up disagreeing.

Worked out from `store/privacy-inventory.md` (read out of
`supabase/migrations/0001`–`0020` and the app's own code). Where this
disagrees with the inventory, the inventory wins — tell me and I will
fix this file.

**Where:** App Store Connect → your app → **App Privacy**. It is set
per app, not per version, and it takes effect when you publish it — but
it must be *accurate for the version you submit*, so anything below that
changes behaviour (setting a Sentry DSN, shipping payments) has to be
updated before that build goes up.

---

## 1. "Do you or your third-party partners collect data from this app?"

**Yes.**

---

## 2. The answer that applies to every single type: tracking

**No data is used for tracking.** For every type below, "Used for
tracking" is **No**.

Apple's definition of tracking is linking data from this app to data
from other companies' apps or websites, or sharing it with a data
broker. The app does neither: no advertising SDK, no analytics SDK, no
third-party identifier, no IDFA request.

Two things in the repository already assert this and must stay true:

- `ios/App/App/PrivacyInfo.xcprivacy` has `NSPrivacyTracking` **false**
  and an empty `NSPrivacyTrackingDomains`.
- `Info.plist` has **no `NSUserTrackingUsageDescription`**, which is
  correct — the key exists only to show the App Tracking Transparency
  prompt, and an app that does not track must not ask.

Because nothing tracks, nothing in the app should ever call
`requestTrackingAuthorization`, and the product page will carry no
"Data Used to Track You" section at all.

---

## 3. Data types

For each type Apple asks three things: whether it is collected, whether
it is **linked to the user's identity**, and **what it is used for**.

Almost everything here is linked, because this is an account-based
product: a coaching record that was not tied to a person would not work.
And almost every purpose is **App Functionality**, because there is no
analytics, no advertising and no marketing use of any of it.

### Contact Info

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Name | **Yes** | Yes | App Functionality | `profiles.full_name`, from the sign-in provider or typed; also the name a coach records on a roster row |
| Email Address | **Yes** | Yes | App Functionality | `profiles.email`. With Sign in with Apple this may be a private relay address |
| Phone Number | **Yes** | Yes | App Functionality | `profiles.phone`, optional; a coach may record a member's |
| Physical Address | **No** | — | — | Decided (§8, q1): city and country are two optional self-typed fields with no street, postcode or anything derived, and nothing is measured from the device. They are declared under **Other Data** instead |
| Other User Contact Info | No | — | — | |

### Health & Fitness

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Health | **Yes** | Yes | App Functionality | **Mood check-ins** (`mood_checkins`) — self-reported wellbeing, dated, tied to an identified account. Not ambiguous. Also **coaching focus**, if you answer open question 3 as recommended |
| Fitness | **See open question 4** | Yes | App Functionality | Tasks a coach sets, which are often exercise or sleep ("10-minute evening walk") |

Declaring health data is what obliges the privacy policy to explain how
it is protected, which §8 already requires.

### Financial Info

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Payment Info | **Yes** | Yes | App Functionality | A coach's payout destination: mobile wallet number, or bank code + account number. Coaches only, optional |
| Other Financial Info | **Yes** | Yes | App Functionality | `payouts` — amount, issuer, destination snapshot, status |
| Credit Info | No | — | — | No credit scoring or creditworthiness data |

Apple's "Payment Info" is written for how a user *pays*; these are the
details a coach is *paid to*. It is still the nearest honest type.

**The national ID goes in Other Data, not here** — decided at §8, q5.
It is an identity document, not a form of payment, and Apple asks you to
pick the type that matches the data rather than its purpose.

**These three rows are "shared"** — decided at §8, q12. Everything else
in this form is processing by a service provider acting on our
instructions; Paymob is different, because a regulated financial
institution uses a national ID for its own KYC and anti-money-laundering
obligations. That is its purpose, not ours.

### Purchases

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Purchase History | **Yes** | Yes | App Functionality | `payments` — what a coach recorded a member as having paid, **offline**. There are no App Store purchases: nothing is sold in the app today |

### User Content

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Emails or Text Messages | **Yes** | Yes | App Functionality | In-app messages between a coach and a member (`messages`, `0014`). Not end-to-end encrypted: encrypted in transit and at rest, readable by the two parties and by `service_role` |
| Photos or Videos | **Yes** | Yes | App Functionality | Profile and cover photos, private `avatars` / `covers` buckets, served by signed URL. **Declared for the photos only** — a 1:1 session's video is carried live and never stored, so it is not collected (see *Video sessions* below) |
| Customer Support | **Yes** | Yes | App Functionality | A member's report about their coach — `pro_reports`, its `reason` and free-text `details`. Seen by the reporter and Rafiq, **never by the coach**. Support itself is a `mailto:`, which leaves the app |
| Other User Content | **Yes** | Yes | App Functionality | Goals, session recaps, a coach's private notes, reviews, offerings, cancellation reasons, and a coach's verification request (`verification_requests.note`, `coach_profiles.cert`) |
| Audio Data | No | — | — | The microphone **is** used, in a 1:1 video session. The audio is carried live and never recorded or stored, so it is not collected as Apple defines the word (see *Video sessions* below) |
| Gameplay Content | No | — | — | |

#### Video sessions, and why neither row changes to Yes

Since #104 a 1:1 session runs inside the app on Daily. Android asks for
`CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`; iOS has
`NSCameraUsageDescription` and `NSMicrophoneUsageDescription`. Both are
requested only when someone taps Join, never at launch.

This form turns on what Apple means by "collect", which is narrower than
"uses". From developer.apple.com/app-store/app-privacy-details/, read
2026-10-05:

> "Collect" refers to transmitting data off the device in a way that
> allows you and/or your third-party partners to access it for a period
> longer than what is necessary to service the transmitted request in
> real time.

and, in its *Additional guidance*:

> if data is sent to your servers then immediately discarded after
> servicing the request, you do not need to disclose this in your answers
> in App Store Connect.

Call media is exactly that case, and it is enforced rather than promised
(`supabase/functions/_shared/sessionVideo.ts`): a room never sets
`enable_recording`, nobody joins as an owner (only owners can start a
recording), and before issuing a token the function reads the Daily
**domain's** own config and returns 503 `recording_enabled_on_domain` if
recording is on there. So nothing is retained anywhere, and **Audio Data
stays No** while **Photos or Videos stays Yes for the stored profile and
cover photos only**.

If recording is ever added, both rows change and so does the payments
answer — Play's 1:1 exemption depends on the session not being recorded
or replayable (`research/payments-rules.md`).

### Identifiers

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| User ID | **Yes** | Yes | App Functionality | `profiles.id`, the auth user's uuid |
| Device ID | No | — | — | No IDFA, no IDFV used as an identifier, no device fingerprint |

### Diagnostics

| Type | Collected | Linked | Purposes | Notes |
|---|---|---|---|---|
| Crash Data | **No, today** | *(Not Linked, when it is on)* | App Functionality | Sentry is built and **off**: with no `VITE_SENTRY_DSN` the SDK is never imported, so nothing is installed and nothing can be sent |
| Performance Data | No | — | — | Tracing and session replay are both off |
| Other Diagnostic Data | No | — | — | |

**When you set the DSN, change this row and re-publish before that build
ships.** When it is on, Crash Data is **Not Linked to You**, which is
unusual enough to be worth stating plainly: no user id, email or name is
ever attached, no breadcrumbs are kept, the device's *name* is dropped,
and emails, phone numbers, national IDs, uuids and JWTs are substituted
out of every string before it leaves.
`tests/crash-reporting.spec.js` proves it by putting a name and a
message body into breadcrumbs and reading what the transport tried to
send.

### Other Data

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Other Data | **Yes** | Yes | App Functionality | The operational record: role, scheduling (`weekly_availability`, `time_blocks`, `standing_slots`, `session_requests`), packages and credits, read cursors, blocks, agreements, a coach's favourite flag, downgrade feedback |

### Not collected at all

**Location** — no geolocation API is called anywhere; the city is text
someone typed, which is why it sits under Contact Info rather than here.
**Sensitive Info** — Apple's type covers race, sexual orientation,
pregnancy, disability, religion, union membership, political opinion,
genetic and biometric data; none is collected. **Contacts** — no address
book access. **Browsing History**, **Search History**, **Usage Data**
(Product Interaction, Advertising Data, Other Usage Data) — there is no
analytics of any kind.

---

## 4. Third-party partners

Apple's question covers data collected *by* third-party code in the app,
not only by you. Two of the parties below ship code that runs on the
device:

| Party | In-app SDK? | What reaches them |
|---|---|---|
| Supabase | Yes (the client) | Everything above — it is the database, auth, storage and realtime. A processor, not a recipient with its own purpose |
| **Daily** (video sessions) | **Yes** — `@daily-co/daily-js`, imported only when a call is joined (`src/lib/videoCall.ts:85`) | The live audio and video of a 1:1 session while it happens, the person's display name, and connection diagnostics the library reports to Daily. Nothing is recorded or stored, enforced as described above |
| Google / Apple sign-in | Via the system browser | They return a name and an email; nothing of ours goes to them |
| Paymob | **No SDK** — server-side only | A coach's name, national ID, account number, amount. Nothing about members |
| Sentry | Built, **not imported** while the DSN is unset | Nothing today |

Google Fonts used to be here and is not: both fonts ship inside the app
(#75) and `tests/fonts.spec.js` fails if a request to Google's font
servers comes back.

**Hosting is `eu-west-1` (Ireland)**, so data about Egyptian users leaves
Egypt — a cross-border transfer under Law 151/2020, which is open
question 7 and a privacy-policy matter rather than a form field.

---

## 5. Account deletion — Guideline 5.1.1(v)

Apple requires any app with account creation to offer **account deletion
from inside the app**, not only a web page or an email.

**We comply.** Profile → delete account files a request, and the
`account-deletion` Edge Function carries it out. The public page at
`https://rafiqpro.com/delete-account/` exists as well, which is Google's
requirement rather than Apple's.

Worth knowing for review: deletion is a **queue, not an instant wipe** —
it refuses while a session, credit, dispute or payout is still open, and
a coach whose roster or payouts must outlive them is locked and
anonymised rather than erased (0012). That is a defensible design, and
`store/review-notes.md` already walks a reviewer through it on a
throwaway account. If a reviewer reads "request" as "not really
deletion", that walkthrough is the answer.

---

## 6. Privacy policy URL

`https://rafiqpro.com/privacy/`, and `https://rafiqpro.com/ar/privacy/`
on the Arabic localization. Blocked on hosting the site (§5); the pages
are built and committed.

---

## 7. The privacy manifest

`ios/App/App/PrivacyInfo.xcprivacy` now declares the same fifteen types
this form does, and is **kept in step by a test** rather than by anyone
remembering.

It used to be an empty `NSPrivacyCollectedDataTypes` array: a manifest
saying the app collects nothing, beside a product page that would list
health and financial data. Nothing failed, because nothing looked.
`tests/privacy-manifest.spec.js` is the thing that looks. It checks:

- the list is **not empty**, which is the original bug;
- every data type and purpose string is one of **Apple's own values**,
  read from
  `developer.apple.com/documentation/bundleresources/app-privacy-configuration`
  — the spelling is not guessable, and the same list contains
  `PhotosorVideos` with a lowercase "or" next to `EmailsOrTextMessages`
  with a capital one. Xcode will not generate a correct privacy report
  if a value is misspelled, and it does not tell you;
- no type is declared twice;
- **every** entry sets `Tracking` false — counted, not spot-checked, so
  a new entry that omits the key fails too;
- no advertising purpose appears anywhere;
- and `Info.plist` still has no `NSUserTrackingUsageDescription`, since
  an app whose manifest says it does not track must not show the ATT
  prompt.

Both failure modes were confirmed by causing them: emptying the array,
and misspelling `PhotosorVideos` as `PhotosOrVideos`.

**The manifest now reflects the decisions in §8**, so it declares
fourteen types rather than fifteen: `PhysicalAddress` was removed when
q1 settled, and `Health` and `Fitness` stayed when q3 and q4 did.

One type is **deliberately absent**: `CrashData`. Sentry is off until
`VITE_SENTRY_DSN` is set, and with no DSN the SDK is never imported, so
declaring it today would be untrue. The day that changes, add it with
`Linked` **false** — and change the Diagnostics row in §3 with it.

## 8. The questions, answered

Settled 4 October 2026. These were `store/privacy-inventory.md`'s
"Ahmed to confirm" list; the inventory now carries the same answers.
Three are **recommendations awaiting an external fact or a lawyer** and
say so.

### Decided

**1 — City and country are not a postal address.** Declared as **Other
Data** (Apple) / **Other info** (Google), not Address. There is no
street, postcode or line-1 field anywhere in `0001`: it is two optional
self-typed fields, plus a flag emoji and a dial code. It is not Location
either — Apple's location types describe what the device measures, not
what someone types. Declaring Address would overstate in the direction
that alarms: a product page reading "collects your physical address"
when the app holds "Cairo" misleads the reader more than the honest
catch-all does. *Removed `PhysicalAddress` from the manifest.*

**3 — Coaching focus is health data. Yes.** The decisive point is that
the marginal cost is **zero**: mood check-ins already force a Health
declaration, so adding focus changes neither product page. Accuracy for
free. "Stress & anxiety" or "sleep" as a chosen focus is an inference
about someone's health whether or not a diagnosis was typed.

**4 — Tasks are fitness data. Yes.** Stronger than it looks: a task
carries a **`done` flag**, so the app records whether the person did the
exercise, not merely that a coach set it. And a coach can type anything,
so the content cannot be bounded.

**5 — The national ID goes in Other Data, not Payment Info.** Apple's
Payment Info means "form of payment, payment card number, bank account
number"; a national ID is none of those. It is an identity document that
happens to be required alongside a payment, and Apple asks for the type
that matches the data rather than its purpose. Sensitive Info is
explicitly enumerated — race, orientation, pregnancy, disability,
religion, union, politics, genetics, biometrics — and a government ID is
not in it. The precision belongs in the policy, where
`privacySection1Body` already names it. *No manifest change: both
`OtherDataTypes` and `PaymentInfo` were already declared, the latter for
the wallet and bank numbers.*

**11 — Crash reporting: on, EU region, after launch.** The privacy cost
is unusually low and already paid for — no user context, no breadcrumbs,
the device name dropped, identifiers substituted out, and a test that
proves it. Against that, shipping a native app with no crash visibility
is its own risk. Use Sentry's **EU region** (`de.sentry.io`) so there is
one data-residency story rather than two; the region lives in the DSN
string, so it is a paste-time choice and needs no code change. Set it in
a release where both store forms are updated in the same go.

**12 — Paymob is "shared", not merely processed.** The processor
exemption holds when a third party acts only on your instructions. A
regulated financial institution uses a national ID for its own KYC and
AML obligations — its own legal purpose. Three Financial Info rows are
therefore declared as shared on both forms. Conservative, and defensible
if anyone asks.

### Recommended, pending one fact

**6 — Does Paymob actually require the national ID?** Unresolved; their
documentation is not reachable from the sandbox this was written in.
What the repository shows is a *belief*: `paymobPayouts.ts:84` enforces
exactly 14 digits. **`scripts/paymob-national-id-check.ts` settles it
in one command** — two 1.00 EGP staging disbursements through the real
`buildDisburseBody`, identical except that the first omits `national_id`,
so a failure on its own proves nothing and the pair is the control. It
needs the Paymob staging credentials, so only Ahmed can run it, and it
writes nothing to the database. Worth doing early — if the answer is no,
question 5 disappears, the hardest row in the inventory goes with it, and
`0009`'s constraint gets simpler.

**9 — Supabase log retention** is plan-dependent: roughly a day on Free,
about a week on Pro. §5 upgrades to Pro before launch, so confirm the
figure on the plan actually bought. Recommendation: **state it in the
privacy policy, do not declare it on either form** — operational host
logs are not what the forms ask about, and neither has a box that fits.
This is the answer to put least weight on.

### Not ours to settle — these need a lawyer

**2 — Can a member see their coach's private notes?** Assume **yes**:
notes about a person are personal data about that person, and
151/2020's access right does not care that the coach considers them
private. There is no screen and there need not be — a documented email
route satisfies an access right. **The real exposure is not legal, it is
that coaches do not know.** Someone writing candidly in the belief it can
never be seen is the problem. The fix is a line in the notes UI and in
the terms, both outside what this change may touch; see §9 below.

**7 — The transfer to `eu-west-1`.** The shape is adequacy *or* explicit
consent, plus a permit from Egypt's Data Protection Centre. Whether that
Centre is issuing has moved around and must be checked locally, now.
Pragmatically: name the transfer in the policy, carry consent through
policy acceptance at sign-up, and have Egyptian counsel confirm the
licence question.

**8 — Retention.** There is no stated period and there needs to be one.
Proposal: data kept while the account exists; financial records
(sessions, payments, payouts) a further **five years** as commercial and
tax law requires; technical logs about a week. The five years should be
confirmed against Egyptian requirements by an accountant.

**And a gap found while answering it: nothing mentions backups.** Not
the policy, not the deletion page, not the app. Supabase holds
point-in-time backups, so a deletion does not purge data instantly — the
deletion page's promise and the technical reality disagree for the
length of the backup window. Wording for this is in §9.

**10 — Age rating questionnaires.** Use the answers drafted here and in
`store/play-console.md`: honest answers to each item, user interaction
and personal-information exchange declared yes, target audience **18+**
on both stores regardless of the rating that falls out. Expect roughly
12+ on Apple and PEGI 3 with interactive-element notices on Google. The
exact rating is an output, not a decision.

---

## 9. Wording for the privacy policy

Three of the answers above need the policy to say something it does not
say today. The policy's text lives in `src/lib/i18n.ts`, which this
change may not touch, so the English is below for whoever edits it —
Arabic to be written alongside, not machine-translated.

**Where the data is held** (question 7):

> Your data is stored on servers in Ireland, operated by our hosting
> provider Supabase. This means information about you leaves Egypt. By
> using Rafiq Pro you consent to that transfer.

**How long it is kept** (question 8):

> We keep your data for as long as your account exists. When an account
> is deleted, records we must keep for legal and financial reasons —
> sessions, payments and payouts — are kept for five years, without the
> details that identify you. Technical logs, which include IP addresses,
> are kept by our hosting provider for a short period, currently about a
> week.

**Backups** (the gap above):

> Deleting your account removes your data from Rafiq Pro immediately.
> Encrypted backups of our database are kept for a short period for
> disaster recovery, so a copy may persist there until that backup
> expires. Backups are never used to restore an individual account.

**And one that is not policy copy but a product change** (question 2):
coaches should be told that notes they write about a member may be
disclosed to that member on request. A line by the notes field, and a
line in the coach terms. Worth raising with whoever owns those screens.

## 10. Where Apple and Google differ, so the two forms stay honest

Filling one from the other is how they end up contradicting each other.
The places they genuinely diverge:

| | Apple | Google |
|---|---|---|
| City / country | Contact Info → Physical Address *or* Other Data | Personal info → Address *or* Other info |
| National ID | **No type exists** (question 5) | Personal info → Other info |
| Messages | User Content → Emails or Text Messages | Messages → Other in-app messages |
| The operational record | Other Data | App activity → Other actions |
| Reports and moderation | User Content → Customer Support | App activity → Other actions, purpose *Fraud prevention and security* |
| Crash data, once on | Diagnostics → Crash Data, **Not Linked** | App info and performance → Crash logs |
| Deletion | In-app deletion is **required** (5.1.1(v)) | A **public URL** is required |

---

## 11. Before you submit

- [ ] Every row above matches the privacy policy, which must be live (§5)
- [ ] The three still-open items in §8 are closed: the Paymob staging run (q6), the Supabase plan's log retention (q9), and counsel on q2, q7 and q8
- [ ] `PrivacyInfo.xcprivacy` still matches the answers in §8 — it does today, and `tests/privacy-manifest.spec.js` fails if a value stops being one of Apple's
- [ ] If `VITE_SENTRY_DSN` is set in the build being submitted, Diagnostics → Crash Data is **Yes**
- [ ] Nothing in the app calls `requestTrackingAuthorization`, and no `NSUserTrackingUsageDescription` has appeared
- [ ] The crisis numbers are confirmed — health data is declared here, and §8 ties the two together
- [ ] `store/play-console.md` says the same things in Google's words

## Keeping this true

Downstream of `store/privacy-inventory.md`. That file says how to notice
when it has gone stale:

```sh
grep -n "create table" supabase/migrations/*.sql   # a new table is a new row
grep -rn "https://" index.html src/                # a new third party
```

A migration that adds a column holding something about a person changes
the inventory, and both store forms with it.
