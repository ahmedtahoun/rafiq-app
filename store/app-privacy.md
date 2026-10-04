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
| Physical Address | **See open question 1** | Yes | App Functionality | Self-typed city and country only — no street, no postcode, nothing derived. Apple's "Physical Address" overstates it and "Other Data" understates it |
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

**The national ID has no good home** — see open question 5.

### Purchases

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Purchase History | **Yes** | Yes | App Functionality | `payments` — what a coach recorded a member as having paid, **offline**. There are no App Store purchases: nothing is sold in the app today |

### User Content

| Type | Collected | Linked | Purposes | Where it comes from |
|---|---|---|---|---|
| Emails or Text Messages | **Yes** | Yes | App Functionality | In-app messages between a coach and a member (`messages`, `0014`). Not end-to-end encrypted: encrypted in transit and at rest, readable by the two parties and by `service_role` |
| Photos or Videos | **Yes** | Yes | App Functionality | Profile and cover photos, private `avatars` / `covers` buckets, served by signed URL. No video anywhere |
| Customer Support | **Yes** | Yes | App Functionality | A member's report about their coach — `pro_reports`, its `reason` and free-text `details`. Seen by the reporter and Rafiq, **never by the coach**. Support itself is a `mailto:`, which leaves the app |
| Other User Content | **Yes** | Yes | App Functionality | Goals, session recaps, a coach's private notes, reviews, offerings, cancellation reasons, and a coach's verification request (`verification_requests.note`, `coach_profiles.cert`) |
| Audio Data | No | — | — | No microphone use |
| Gameplay Content | No | — | — | |

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
not only by you. The app embeds no third-party SDK that collects
anything:

| Party | In-app SDK? | What reaches them |
|---|---|---|
| Supabase | Yes (the client) | Everything above — it is the database, auth, storage and realtime. A processor, not a recipient with its own purpose |
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

**Three entries depend on open questions below**, and are marked in the
file where they appear:

| Entry | Question | If the answer changes |
|---|---|---|
| `PhysicalAddress` | 1 — is self-typed city and country an address? | Remove the entry; it becomes Other Data, which is already declared |
| `Health` (its "coaching focus" part) | 3 | The entry stays regardless — mood check-ins alone require it |
| `Fitness` | 4 | Remove the entry if tasks are not fitness data |

And one is **deliberately absent**: `CrashData`. Sentry is off until
`VITE_SENTRY_DSN` is set, and with no DSN the SDK is never imported, so
declaring it today would be untrue. The day that changes, add it with
`Linked` **false** — and change the Diagnostics row in §3 with it.

## 8. The open questions

The same list as `store/play-console.md`, which is
`store/privacy-inventory.md`'s "Ahmed to confirm" set — but two of them
land *harder* on Apple's form than on Google's, so they are first.

| # | Question | Where it bites on this form |
|---|---|---|
| **5** | **Where does a national ID go?** Apple has no type for a government identity number. Its Sensitive Info list is race, orientation, pregnancy, disability, religion, union, politics, genetics, biometrics — a national ID is none of them. Financial Info → Payment Info is the nearest honest home given it exists only to send money; Other Data is the alternative | Financial Info → Payment Info, or Other Data |
| **1** | **Self-declared city and country** — "Physical Address" overstates it, "Other Data" understates it. Apple's Physical Address is the one that reads worst on a product page for what is two optional text fields | Contact Info → Physical Address |
| 3 | Whether coaching focus counts as health data. Recommendation: yes | Health & Fitness → Health |
| 4 | Whether tasks count as fitness data. Recommendation: yes | Health & Fitness → Fitness |
| 6 | Whether Paymob genuinely requires `national_id`. If not, stop collecting it — question 5 disappears with it | Financial Info |
| 2 | Whether a member may see their coach's private notes under Law 151/2020 | Not a form field; a legal exposure |
| 7 | What Law 151/2020 requires for the transfer to Ireland | The policy this form must match |
| 8 | A retention period for data not covered by a deletion request | The policy |
| 9 | Supabase's own log retention, which holds IP addresses | Whether IPs are collected at all |
| 10 | The age rating questionnaire | Apple's own, separate from App Privacy |
| 11 | Whether to switch crash reporting on, and which Sentry region | Diagnostics → Crash Data flips to Yes |

And the one this pair of documents adds:

| 12 | **Is Paymob "sharing" or "processing"?** Apple asks whether data is shared with third parties for *their* purposes. Everything above is answered as processing. Paymob is the one where a reasonable person could disagree — a coach's name, national ID and account number leave our chain to a payment provider | Financial Info, three rows |

---

## 9. Where Apple and Google differ, so the two forms stay honest

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

## 10. Before you submit

- [ ] Every row above matches the privacy policy, which must be live (§5)
- [ ] The eleven open questions are answered, and this file updated
- [ ] `PrivacyInfo.xcprivacy` still matches the final answers (§7) — it matches this draft; re-check the three question-dependent entries once the questions are settled
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
