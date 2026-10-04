# Privacy inventory — Rafiq Pro

Every piece of personal data the app collects, worked out from the code and
`supabase/migrations/0001`–`0017`, with each one mapped to Apple's **App
Privacy** types and Google's **Data safety** categories. Checklist §7 and §8.

This is the working sheet for filling in those two forms and for checking
the privacy policy against what the app actually does. It is not the policy
itself.

**"Ahmed to confirm"** marks anything the code cannot settle — a business
decision, a third party's own behaviour, or a legal question. There are
twelve of them, collected at the end.

**Where it is stored** means the table or bucket in the live Supabase
project, unless it says otherwise. Signed out, everything in the app is in
`localStorage` on the device and never leaves it; that is the demo, and it
is not in this inventory except where noted.

**Nothing here is used for tracking** in Apple's sense — the app has no
advertising SDK, no analytics, no third-party identifier, and it never
links a user to data from another company's apps or sites. Both forms'
"used for tracking" answer is **No**, for every row. That is worth saying
once rather than repeating in forty rows.

---

## 1. Account and identity

| What | Where | Linked to the user | Why | Apple | Google |
|---|---|---|---|---|---|
| Name | `profiles.full_name`, and `clients.full_name` when a coach types it for a walk-in member | Yes | It is how each side of a relationship sees the other | Contact Info → Name | Personal info → Name |
| Email address | `profiles.email`, from the sign-in provider | Yes | Account identity, and how support replies | Contact Info → Email Address | Personal info → Email address |
| Phone number and dial code | `profiles.phone` / `country_code`; `clients.phone` / `country_code` / `email` for a member a coach added by hand | Yes | So a coach can reach a member outside the app | Contact Info → Phone Number | Personal info → Phone number |
| Country, city, country flag | `profiles.country`, `.city`, `.country_flag` | Yes | Shown on a coach's public card; the dial code follows the country | Contact Info → Physical Address — **Ahmed to confirm** | Personal info → Address — **Ahmed to confirm** |
| Account identifier | `auth.users.id`, on every row | Yes | It is the primary key of the whole schema | Identifiers → User ID | Personal info → User IDs |
| Role (coach or member) | `profiles.role` | Yes | Decides which half of the app you get | Other Data | App activity → Other actions |

A city and a country typed by the user are not device location: the app
asks for no location permission and calls no location API. Apple has no
"self-declared place" type, and Physical Address is the nearest fit while
overstating it slightly; Google's Address is the same problem. **Ahmed to
confirm** with whoever reviews the forms — the alternative is Apple's
"Other Data" and Google's "Other info", which understate it.

### Sign-in providers

Sign-in is Google or Apple only (`src/lib/auth.ts`: `OAuthProvider =
'google' | 'apple'`). There is no password, so the app stores none. The
provider hands back a name and an email; with Apple's "Hide My Email" the
email is a private relay address, which is why §5 has registering
`support@rafiqpro.com` for Apple private relay as a to-do — without it,
mail to those members is dropped.

---

## 2. What a coach records about a member

This is the sharpest part of the inventory: most of it is **one person's
data written by another person**, and the member cannot see some of it.

| What | Where | Visible to | Apple | Google |
|---|---|---|---|---|
| Roster row — name, initials, age, phone, email, city, plan, programme, progress %, payment status | `clients` | The coach; the member too once linked (`can_see_client`) | Contact Info → Name / Email / Phone; Other Data | Personal info → Name, Email address, Phone number |
| Goal, focus, specialty as the *coach* records them | `clients.goal` / `.focus` / `.specialty` | Both sides | User Content → Other User Content | App activity → Other user-generated content |
| Goal and focus as the *member* records them | `member_profiles.goal` / `.focus` | The member, and any coach with them on their roster | User Content → Other User Content | App activity → Other user-generated content |
| **The coach's private notes** | `client_private.notes` | **The coach only** — RLS is `is_coach_of`, the member cannot read it | User Content → Other User Content | App activity → Other user-generated content |
| Whether the coach favourited them | `client_private.is_favourite` | The coach only | Other Data | App activity → Other actions |

`client_private.notes` is free text a coach writes about a member. Nothing
constrains what goes in it, so in practice it will contain health
information, family circumstances and worse. It is the row most worth
naming explicitly in the privacy policy, and it is deliberately excluded
from what an invite exposes (the invite card in ClientDetail says so before
a code is generated).

**Ahmed to confirm**: whether a member has a right to see notes written
about them under Law 151/2020's access right, and if so, how that request
is served — there is no screen for it today.

---

## 3. Health and wellbeing

| What | Where | Apple | Google |
|---|---|---|---|
| Mood check-ins, kept as dated history | `mood_checkins` (`great`, `good`, `okay`, `low`, `hard` + timestamp) | **Health & Fitness → Health** | **Health and fitness → Health info** |
| Coaching focus — life, meditation, breathwork, stress & anxiety, sleep, fitness, nutrition, yoga, diving… | `member_profiles.focus`, `clients.focus` / `.specialty` | Health & Fitness → Health — **Ahmed to confirm** | Health and fitness → Health info — **Ahmed to confirm** |
| Tasks a coach sets, which are often exercise or sleep | `tasks.title` / `.description` | Health & Fitness → Fitness — **Ahmed to confirm** | Health and fitness → Fitness info — **Ahmed to confirm** |

Mood is not ambiguous: it is self-reported wellbeing, dated, tied to an
identified account. It goes in both forms as health data, and §8 already
says the policy has to explain how it is protected.

The other two are judgement calls. "Stress & anxiety coaching" as a chosen
focus is an inference about someone's mental health even though nobody
typed a diagnosis, and a task saying "10-minute evening walk" is fitness
data by any ordinary reading. Declaring them costs nothing and understating
them is the expensive mistake, so the recommendation is to declare both —
but it is a call, not a fact. **Ahmed to confirm.**

`process_account_deletion` (0012) deletes `mood_checkins` outright when a
member's account goes. Nothing anonymises or keeps it.

---

## 4. Messages

| What | Where | Apple | Google |
|---|---|---|---|
| Message text, sender, timestamp | `messages` (`body`, `sender_id`, `sender_role`, `created_at`) | User Content → Emails or Text Messages | Messages → Other in-app messages |
| Read cursors | `message_reads` | Other Data | App activity → Other actions |
| Blocks, either side | `clients.blocked_by_member_at` / `.blocked_by_coach_at` | Other Data | App activity → Other actions |

Messages are sent and stored by Rafiq only — no third-party messaging
service, which is what `privacySection4Body` and
`clientPrivacySection4Body` now say. They are delivered live over Supabase
Realtime (0014); that is the same database, not another company.

Blocking is real from either side (0014) and neither side can lift the
other's. Apple requires blocking for apps where users message each other
(§8).

**On deletion**, 0012 deletes the messages *the deleted person sent*
(`delete from public.messages where sender_id = v_uid`). The other side's
own messages stay, because they are that person's record of the
conversation. Worth stating plainly in the policy: leaving a conversation
does not remove it from the other person's phone.

### Video sessions (Daily)

The camera and microphone are used only during a 1:1 video session, and
only after the person taps Join. The call runs through Daily (§11); it
is **not recorded or stored** by Rafiq or by Daily, so on both forms
audio and video are *processed, not collected*. Apple: no "Audio Data"
or "Photos or Videos" row for calls. Google: Data safety asks about data
collected or shared; ephemeral real-time processing that isn't stored
is outside it, but the camera and microphone permissions still show on
the listing — **Ahmed to confirm** with the form's own help text. Not
recording is also what keeps a 1:1 online session outside Play Billing
(research/payments-rules.md).

---

## 5. Photos

| What | Where | Apple | Google |
|---|---|---|---|
| Profile photo | `avatars` bucket, path `<profile_id>/<file>`; the path is in `profiles.avatar_photo_url` | User Content → Photos or Videos | Photos and videos → Photos |
| Cover photo (coaches) | `covers` bucket; path in `coach_profiles.cover_photo_url` | User Content → Photos or Videos | Photos and videos → Photos |

Both buckets are **private** (0003) — not served off the CDN, read through
a time-limited signed URL by a signed-in user. That was a deliberate choice
so photos are not on the open internet while Discover itself is behind
sign-in.

The picker asks for camera and photo library access on iOS
(`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, both
localised). The app reads the one file the user picks; it never enumerates
the library.

0012 returns the photo paths so the `account-deletion` Edge Function can
remove the objects from Storage. Photos are deleted, not anonymised.

---

## 6. Money

### What members and coaches see

| What | Where | Apple | Google |
|---|---|---|---|
| Payment ledger — amount, currency, method, note, state, refunds | `payments` | Financial Info → Other Financial Info; Purchases → Purchase History | Financial info → Purchase history |
| Session packages and credits | `packages` | Other Data | App activity → Other actions |
| Subscription tier and renewal | `subscriptions` | Purchases → Purchase History | Financial info → Purchase history |
| Why a coach downgraded | `subscription_cancel_feedback` (`reason`, free-text `note`) | Other Data | App activity → Other user-generated content |

Today the app charges nothing: booking sends a request with no payment step
and writes no payment row, and both upgrades are a "Coming soon" state
(§3). `payments` rows exist for a coach recording what a member paid them
offline. **When In-App Purchase, Play Billing and Paymob land, this section
changes and both forms have to be re-submitted.**

### Coach payout details — the most sensitive rows in the database

| What | Where | Apple | Google |
|---|---|---|---|
| Mobile wallet number, or bank code + account number / IBAN | `coach_payout_accounts.msisdn`, `.bank_code`, `.account_number` | Financial Info → Payment Info | Financial info → User payment info |
| Account holder's name | `coach_payout_accounts.full_name` | Contact Info → Name | Personal info → Name |
| **National ID (14 digits)** | `coach_payout_accounts.national_id` | **no exact Apple type** — see below | Personal info → Other info — **Ahmed to confirm** |
| Payout records — amount, issuer, destination snapshot, Paymob transaction id, status | `payouts` | Financial Info → Other Financial Info | Financial info → Other financial info |

Google's "User payment info" is written as how a user *pays*, and these
are the details they are *paid to*; it is still the only category that
means "a financial account of the user's", so it is the right box. The
payouts ledger below is amounts and statuses, which is Other financial
info.

Readable by the coach themselves and `service_role`, nobody else
(`coach_payout_accounts_own`). The app has no write grant on `payouts` at
all; only the admin-only Edge Function creates them.

**Apple has no data type for a government identity number.** Its Sensitive
Info type lists race, sexual orientation, pregnancy, disability, religion,
union membership, political opinion, genetic and biometric data — a
national ID is none of those. Financial Info → Payment Info is the nearest
honest home for it given it exists only to send money, with Other Data as
the alternative. **Ahmed to confirm** with whoever files the form; whatever
is chosen, §8 already requires the national ID to be named in the privacy
policy itself, where there is room to be precise, and
`privacySection1Body` already does that in both languages.

Two things that are already right and should stay right:

- **0009 forbids a national ID on the payout ledger.** 0007 copied it into
  each payout's `destination` snapshot; `payouts` is kept after an account
  is deleted, and the public deletion page promises the national ID goes,
  so 0009 added a check constraint that refuses it. The function reads it
  from `coach_payout_accounts` at send time instead.
- **0012 deletes `coach_payout_accounts` outright** when a coach's account
  is processed. `payouts` rows stay as the financial record, without it.

**Ahmed to confirm** (already on the checklist, §3): the staging payout run
settles whether Paymob genuinely needs `national_id`. If it does not, stop
collecting it — that removes the hardest row in this inventory.

---

## 7. Scheduling and the coaching record

| What | Where | Apple | Google |
|---|---|---|---|
| Sessions — time, attendance, who marked it, recap text | `sessions` | User Content → Other User Content | App activity → Other user-generated content |
| Coach's weekly hours, busy blocks, pending requests | `weekly_availability`, `time_blocks` | Other Data | App activity → Other actions |
| A member's preferred recurring slot | `standing_slots` | Other Data | App activity → Other actions |
| Session requests to a coach a member has no relationship with | `session_requests` | Other Data | App activity → Other actions |
| Cancellations — who, when, how long before, reason | `cancellations` | Other Data | App activity → Other user-generated content |
| Coaching service agreement, sent and signed | `agreements` | Other Data | App activity → Other actions |
| Programme enrolment and progress | `enrollments` | Other Data | App activity → Other actions |
| Task templates a coach saves | `templates` | User Content → Other User Content | App activity → Other user-generated content |
| What a coach sells | `offerings` | Other Data | App activity → Other actions |
| Favourited coaches | `favourite_coaches` | Other Data | App activity → Other actions |
| In-app notification feed | `notifications` (`kind`, `payload`, `read_at`) | Other Data | App activity → App interactions |
| Notification preferences | `notification_prefs` | Other Data | App activity → Other actions |

None of this is a device calendar: the app asks for no calendar
permission, reads no `EKEventStore` and writes no events. Google's Calendar
category does **not** apply.

`notifications` is an in-app feed, not push. There is no APNs key, no
Firebase project and no push plugin, so there is no push token to declare —
today. That changes the moment push is built.

---

## 8. Reviews, reports and moderation

| What | Where | Who sees it | Apple | Google |
|---|---|---|---|---|
| Star rating and written review | `ratings` (`rating`, `comment`) | Both sides of the relationship; publicly through `coach_reviews` | User Content → Other User Content | App activity → Other user-generated content |
| Reviewer's name on a public review | derived in the `coach_reviews` view | Anyone signed in | Contact Info → Name | Personal info → Name |
| A member's report about their coach | `pro_reports` (`reason`, free-text `details`) | The reporter and Rafiq — **never the coach** | User Content → Customer Support | App activity → Other user-generated content |
| A coach's verification request | `verification_requests` (`note`) plus `coach_profiles.cert` / `.certifications` | The coach and Rafiq | User Content → Other User Content | App activity → Other user-generated content |
| Account status — active, suspended, deleted | `profiles.account_status` | Rafiq; the effect is visible to others | Other Data | App activity → Other actions |

**Public reviews are signed with a first name and last initial** — the
`coach_reviews` view does that in SQL
(`split_part(...) || left(split_part(...), 1) || '.'`), so "Sara Ahmed"
publishes as "Sara A.". The comment in 0005 gives the reason: the roster
name is the coach's own label for someone who may be talking about a
breakup or their health, and a public page gets no more of it than that.
Whoever wires reviews into the UI must select the view's `reviewer_name`
and never join back to `profiles.full_name` — that is on the checklist as
its own line.

**On deletion**, 0012 nulls a departing member's review *comments* but
leaves the star rating in the coach's average. The reasoning is that the
words are theirs and the number is part of someone else's public record.
Worth stating in the policy, because it is a deliberate exception to
"everything is deleted".

Verification collects typed credential text only. **There is no document
upload today** — if credential photos or certificates are ever accepted,
that is a new row here (identity documents) and both forms change.

---

## 9. Invite codes

| What | Where | Apple | Google |
|---|---|---|---|
| The code itself, its expiry and when it was issued | `clients.invite_code`, `.invite_expires_at`, `.invite_created_at` | Other Data | App activity → Other actions |
| Failed peek/claim attempts — account id and timestamp | `client_invite_attempts` | Other Data | App activity → Other actions (purpose: **Fraud prevention and security**) |

A code is a bearer token, not personal data in itself, but it links two
accounts, so it belongs here. 10 characters of Crockford base32, 50 random
bits, single use, 14 days (0013). Claiming it is what sets
`clients.member_id`, which is the moment a coach's roster row becomes a
real person's record.

`client_invite_attempts` exists only for the rate limit — 10 failures per
account per hour — and rows older than a day are cleared as they go. It is
the one table in the schema whose purpose is security rather than
functionality, and it is the row on Google's form where the purpose is
"Fraud prevention, security and compliance" rather than "App
functionality".

---

## 10. Diagnostics — built, and off

| What | Status | Apple | Google |
|---|---|---|---|
| Crash reports | **Not collected while `VITE_SENTRY_DSN` is unset**, which it is. The code is in place; the switch is the DSN | Diagnostics → Crash Data, *the day the DSN is set* | App info and performance → Crash logs, *the day the DSN is set* |
| Analytics | **Not collected.** No analytics SDK of any kind | — | — |
| Advertising identifiers | **Not collected.** No ad SDK, no IDFA request | — | — |

`src/lib/crashReporting.ts` wires `@sentry/capacitor` to `ErrorBoundary`.
With no DSN the SDK is not merely disabled, it is **never imported** — it
is a separate chunk that is never fetched — so nothing is installed and
nothing can be sent. Setting the DSN is therefore a privacy decision, not
a configuration one, and it is what turns the two rows above on.

**What a crash report would carry, once the DSN is set:**

| Sent | Not sent |
|---|---|
| The error type, message and stack trace, scrubbed | Breadcrumbs of any kind — dropped twice over |
| The React component stack, so the failing screen is named (component names, never props) | Any user: no id, email or name is attached |
| Device model, OS version, app version, locale | The device's *name* — "Ahmed's iPhone" is its owner's |
| The release and environment | Request headers, cookies, query string or body |
| A timestamp | Performance traces and session replay, both off |

Everything that does go carries emails, phone numbers, 14-digit national
IDs, uuids and JWTs replaced with `[email]`, `[phone]`, `[id]`, `[uuid]`
and `[token]` first. Stack frames are deliberately left intact — file
paths and line numbers are the point of a crash report, and the phone
pattern would otherwise eat them.

**Only JavaScript errors are reported.** `@sentry/capacitor` ships Sentry's
native iOS and Android SDKs, but they are never started
(`enableNative: false`). Started, they would send every event onward after
the scrubber has run, adding their own breadcrumbs (request URLs among
them), and would report native crashes without going through it at all.
The cost is that a crash in native plugin code is not reported; the app's
own code is all JavaScript.

**Names are the one thing no pattern can find**, so they are kept out
structurally rather than filtered: no user context, nothing attached from
props or state, and no breadcrumbs. Breadcrumbs are where a name would
actually have appeared — Sentry records the text of every element a user
taps, every console line, and every request URL, so a member's name, a
message body and a row id all travel that way by default. All of it is
dropped, and `tests/crash-reporting.spec.js` proves it by putting a name
and a message body into breadcrumbs and reading what the transport tried
to send.

---

## 11. Who else the data reaches

| Third party | What reaches them | Why |
|---|---|---|
| **Supabase** | Everything above — it is the database, the auth server, the file storage and the realtime channel | It is the backend. A processor, not a recipient with its own purpose |
| **Google** (Sign in with Google) | Whatever Google already knows; it returns a name and an email | Sign-in |
| **Apple** (Sign in with Apple) | Same, and the email may be a private relay address | Sign-in |
| **Paymob** | A coach's name, national ID, wallet or bank account number, and the amount | Sending a coach their payout. Nothing about members reaches Paymob today |
| **Sentry** | Nothing today. Once a DSN is set: crash reports, as broken down in §10 | Knowing the app crashed, and where |
| **Daily** (video sessions) | The live audio and video of a 1:1 session while it happens, each person's display name, and connection diagnostics from Daily's own library (`@daily-co/daily-js` reports its errors to Daily) | Running the call. **Nothing is recorded or stored**: rooms never set `enable_recording`, nobody is an owner, and the `session-video` function refuses a Daily domain that records (`supabase/functions/_shared/sessionVideo.ts`) |

Google Fonts used to be on this list: `index.html` fetched Lora and Cairo
from `fonts.googleapis.com`, which handed every user's IP and User-Agent
to Google. Both fonts ship inside the app now (#75, `@fontsource/*`), and
`tests/fonts.spec.js` fails if a request to Google's font servers comes
back. Keep it that way — a webfont link is the easiest way to add a
third party to this table without noticing.

**Where the data is hosted: Supabase region `eu-west-1` (Ireland)**,
read from `supabase projects list`. Personal data about Egyptian users
therefore leaves Egypt, which is a cross-border transfer under Law
151/2020 — **Ahmed to confirm** what that requires (§8). For EU users the
data stays in the EU.

---

## 12. Deletion and retention

What the public page at `site/public/delete-account/` promises, and what
0012 actually does. They agree today; anyone changing either must check the
other.

**Deleted**

- The account and the login (a member's is always deleted outright).
- Name, email, phone, city, country, and the photos in both buckets.
- What their coaches held about them on the roster row — name, initials,
  age, phone, email, city, dial code are all blanked.
- Mood check-ins, entirely.
- The messages that person sent.
- A coach's payout details, including the national ID.
- A coach's availability and their future time blocks; their offerings are
  deactivated and pending requests declined.

**Kept**

- Sessions and payments, for the other side of the relationship — without
  the deleted person's details. A member's record of what they paid and
  attended is theirs, not the coach's to erase.
- Payout records, as the financial record — never including the national
  ID (0009).
- Star ratings, without their comments.

**A coach is locked rather than deleted** whenever anything has to outlive
them: any roster row, or any payout. Deleting that login would cascade
through `profiles` into both. The profile is blanked and marked `deleted`,
which takes it out of `coach_directory`, and the Edge Function bans the
login and replaces its email.

**It refuses to run**, changing nothing, while an upcoming session, an open
dispute, unused session credits or an unsettled payout is outstanding
(SQLSTATE 55006). The page says these are settled first.

**Timing: within 30 days**, stated on the public page. Someone has to
actually meet it — checklist §9.

**Ahmed to confirm** — retention for everything *not* covered by a deletion
request. No table in the schema has a retention period: a session from
2026 is still there in 2031 unless someone deletes their account. Law
151/2020 expects a stated retention period, and neither privacy policy has
one.

**Ahmed to confirm** — Supabase's own logs. Request logs and auth logs hold
IP addresses on Supabase's retention schedule, not ours, and no app code
touches them. They are not in any table in this repo, which is precisely
why they are easy to leave off a form that was filled in by reading the
schema.

---

## Everything marked "Ahmed to confirm", in one list

1. **Self-declared city and country** — Apple's Physical Address and
   Google's Address overstate it; Other Data / Other info understate it.
   Pick one.
2. **Whether a member may see the coach's private notes** about them under
   Law 151/2020's access right. There is no screen for it.
3. **Whether coaching focus counts as health data** on both forms.
   Recommendation: yes.
4. **Whether tasks count as fitness data** on both forms. Recommendation:
   yes.
5. **Where a national ID goes on Apple's form** — Apple has no type for a
   government identity number.
6. **Whether Paymob genuinely requires `national_id`** (already §3, the
   staging payout run). If not, stop collecting it.
7. ~~Whether to self-host the fonts~~ — done (#75); Google Fonts is off
   the third-party table.
8. **What Law 151/2020 requires for the transfer to Ireland.** The
   region is known now: `eu-west-1`. What is not is whether hosting there
   needs a licence or a clause in the policy.
9. **A retention period** for data not covered by a deletion request.
   Neither policy states one.
10. **Supabase's own log retention**, which holds IP addresses and is
    invisible from this repo.
11. **The age rating and content questionnaires** (§8) — this inventory
    is the input to them, but the answers are Ahmed's.
12. **Whether to switch crash reporting on at all**, and if so which
    Sentry region the project lives in — the same data-residency question
    as 8, for a second processor. Setting `VITE_SENTRY_DSN` is what adds
    the Diagnostics rows to both forms.

---

## How to keep this true

This document was written by reading `supabase/migrations/0001`–`0017`,
`src/lib/auth.ts`, `src/lib/storage.ts`, `src/lib/support.ts`,
`index.html` and the privacy copy in `src/lib/i18n.ts`. The fastest way to
find out whether it has gone stale:

```sh
grep -n "create table" supabase/migrations/*.sql   # a new table is a new row here
grep -rn "https://" index.html src/                # a new third party
```

A migration that adds a table, a column holding something about a person,
or a request to a host that is not Supabase, changes this file — and both
store forms with it.
