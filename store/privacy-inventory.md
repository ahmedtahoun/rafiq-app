# Privacy inventory — Rafiq Pro

Every piece of personal data the app collects, worked out from the code and
`supabase/migrations/0001`–`0017`, with each one mapped to Apple's **App
Privacy** types and Google's **Data safety** categories. Checklist §7 and §8.

This is the working sheet for filling in those two forms and for checking
the privacy policy against what the app actually does. It is not the policy
itself.

**"Ahmed to confirm"** marks anything the code cannot settle — a business
decision, a third party's own behaviour, or a legal question. All were
answered on 4 Oct 2026; the list at the end records each answer, and
the five that still need an external fact or a lawyer.

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
only after the person taps Join. Android requests `CAMERA`,
`RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`; iOS has
`NSCameraUsageDescription` and `NSMicrophoneUsageDescription`. The call
runs through Daily (§11) and is **not recorded or stored** — enforced,
not promised: no room sets `enable_recording`, nobody joins as an owner,
and `session-video` refuses a Daily domain with recording on
(`supabase/functions/_shared/sessionVideo.ts`). Not recording is also
what keeps a 1:1 online session outside Play Billing
(research/payments-rules.md).

The two forms do **not** answer this the same way, and only one of them
is settled:

- **Apple: settled.** Its definition of "collect" is retention beyond
  servicing a request in real time, and its guidance says data
  immediately discarded need not be disclosed (quoted in
  `store/app-privacy.md`, *Video sessions*, from developer.apple.com read
  2026-10-05). No "Audio Data" row; "Photos or Videos" stays Yes for the
  stored profile and cover photos only.
- **Google: open.** Data safety offers a *Processed ephemerally*
  checkbox, but no page reachable from the sandbox this was written in
  states that ephemeral-only processing is exempt from being declared
  collected at all — and `support.google.com` is blocked, so the help
  text is unread. Recommendation is to declare both rows as collected
  with Processed ephemerally = Yes, Shared = No; the argument and the
  alternative are in `store/play-console.md` §7, and it is q13 in that
  file's open list. The permissions show on the listing either way, which
  is the practical reason to declare rather than stay silent.

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
`scripts/paymob-national-id-check.ts` is that run reduced to one command:
two 1.00 EGP disbursements through the real `buildDisburseBody`, identical
except that the first omits the field. It needs the Paymob staging
credentials in the environment, so only Ahmed can run it; it writes nothing
to the database, and its header says how.

---

## 7. Scheduling and the coaching record

| What | Where | Apple | Google |
|---|---|---|---|
| Sessions — time, attendance, who marked it, recap text | `sessions` | User Content → Other User Content | App activity → Other user-generated content |
| Coach's weekly hours, busy blocks, pending requests | `weekly_availability`, `time_blocks` | Other Data | App activity → Other actions |
| A member's preferred recurring slot | `standing_slots` | Other Data | App activity → Other actions |
| Session requests to a coach a member has no relationship with | `session_requests` | Other Data | App activity → Other actions |
| Cancellations — who, when, how long before, reason | `cancellations` | Other Data | App activity → Other user-generated content |
| Coaching service agreement, sent and signed | `agreements` (`status`, `sent_at`, `signed_at`) | Other Data | App activity → Other actions |
| What a signature records: which agreement (`category`), a SHA-256 of the exact text the member was shown (`text_sha256`), the language it was shown in (`lang`), the member's own account (`signed_by`) and the server's clock (`signed_at`) | `agreements` (0028) | Other Data | App activity → Other actions |
| Programme enrolment and progress | `enrollments` | Other Data | App activity → Other actions |
| Task templates a coach saves | `templates` | User Content → Other User Content | App activity → Other user-generated content |
| What a coach sells | `offerings` | Other Data | App activity → Other actions |
| Favourited coaches | `favourite_coaches` | Other Data | App activity → Other actions |
| In-app notification feed | `notifications` (`kind`, `payload`, `read_at`) | Other Data | App activity → App interactions |
| Notification preferences | `notification_prefs` | Other Data | App activity → Other actions |
| This phone's push address, the app's language on it, its time zone, and the kinds switched off there — only once the person turns phone notifications on | `device_tokens` (0023) | Identifiers → Device ID (**Ahmed to confirm**: Apple doesn't name push tokens; most apps declare them here, linked to the user) | Device or other IDs (**Ahmed to confirm**: same reasoning) |

None of this is a device calendar: the app asks for no calendar
permission, reads no `EKEventStore` and writes no events. Google's Calendar
category does **not** apply.

A signature is evidence, which is why 0028 records more than a tick.
`text_sha256` hashes the title and body the member was actually shown, so
the row commits them to one exact wording rather than to "the agreement",
and `lang` says which of the two languages that was. The hash only pins
the words while the words are still kept somewhere: edit the copy in
`i18n.ts` and every older signature points at a hash nothing matches any
more. That is what `store/agreement-versions.md` is for (#176) — it
archives each version's full text beside its hash, and a test fails until
a changed one is archived. A signature does not record which version it
was; the hash is unique, so the archive supplies that.
`signed_by` is a plain `uuid` rather than a reference to `profiles`,
deliberately: the record is meant to outlive the account it names. Nothing
in the app changes or deletes a signed row — `update` and `delete` are
revoked from `authenticated` — and a coach's attempt to delete a
relationship holding one is refused.

It therefore survives a member's account deletion: 0012 blanks the roster
row rather than deleting it (`update public.clients set full_name = ''` …),
so the agreement, its hash and its language remain, with `signed_by` still
naming a login that no longer exists. **Whether it should, and for how
long, is a question for the lawyer** — the brief asks it as "Is a tap
adequate evidence of signature?" (#140), and `store/LEGAL-DRAFTS.md`
clause 14 describes the record. No table in the schema has a retention
period (§12).

`notifications` is the in-app feed, and since 0023 also what phone
notifications are sent from: the `push-send` function turns a new row into
a banner through Apple (APNs) or Google (Firebase Cloud Messaging), only to
the phones in `device_tokens`. A phone is only there after its owner turned
notifications on (the app never asks at launch), it moves to whoever signs
in on it, and signing out removes it. A message banner never carries the
message text. The token is declared in the row above.

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
| **Apple** (APNs) and **Google** (Firebase Cloud Messaging) | The phone's push token and each banner's title and line: a name, a time, a task's title — never a message's text | Delivering phone notifications to people who turned them on (`supabase/functions/push-send`) |
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
- A signed coaching agreement, with its category, text hash, language
  and the uuid that signed it. §7 says why this is deliberate; how long
  it may be kept is unanswered.

⚠️ **The public page does not name everything in that list.**
`deleteKeptBody` in `site/copy.mjs` says only that the other side "keeps
their own record of the sessions and payments they had together", and
payouts are covered as a financial record. **Star ratings and now a signed
agreement are kept and unmentioned** — the agreement carrying the member's
own signature and a hash of what they signed. So the "they agree today"
line above holds for what is *deleted* and not for all of what is *kept*.
Closing it is a copy change on a page Google Play requires, which is the
same shape as #132 (the page is silent about backups too) and wants the
same answer from the lawyer. Noted here rather than edited: this file
records what is true, and the page's wording is not this PR's to choose.

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

**The member's own copy (right of access).** Profile → Privacy →
"Download my data" hands a member one JSON file (`memberExport.ts`, #171):
their profile and goals; per relationship, the roster row with its tasks,
sessions, mood check-ins, messages, ratings, agreement, packages, payments
and enrolments; and their session requests, favourite coaches and
notifications. Whole rows, not what a screen happens to show of them.

Two things let that be described so plainly. It is read **as the member**,
through the same RLS as every screen, so it cannot hold anything they
could not already open — a coach's private notes (`client_private`) are
unreadable to a member, so they are absent by construction rather than by
being filtered out. And it is assembled **on the phone**: no server-side
job, no file in storage, nothing queued, so it adds nothing to §11 and
leaves nothing behind to delete. A table that fails to read fails the
whole export, rather than handing over a file that quietly omits part of
it.

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

## Everything marked "Ahmed to confirm" — answered 4 Oct 2026

The reasoning for each is in `store/app-privacy.md` §8; both store-form
documents carry the same answers. Six are settled, five still need an
external fact or a lawyer and are marked **OPEN**.

1. **Self-declared city and country** → **Other Data / Other info**, not
   Address. No street, postcode or line-1 field exists; nothing is
   measured from the device. Declaring "Address" would overstate in the
   direction that alarms the reader.
2. **OPEN (counsel).** Whether a member may see their coach's private
   notes under Law 151/2020. Assume **yes** — notes about a person are
   personal data about that person — and handle requests by email; no
   screen is required. The real exposure is that **coaches do not
   know**, which is a product change, not a form answer.
3. **Coaching focus is health data** → **yes**. Mood check-ins already
   force a Health declaration, so the marginal cost is zero.
4. **Tasks are fitness data** → **yes**. A task carries a `done` flag,
   so the app records whether the person did the exercise.
5. **A national ID on Apple's form** → **Other Data**, not Payment Info.
   It is an identity document, not a form of payment, and Apple asks for
   the type that matches the data rather than its purpose. Google's
   "Other info" was already right.
6. **OPEN (one command).** Whether Paymob genuinely requires
   `national_id`. `_shared/paymobPayouts.ts:84` enforces 14 digits, which
   encodes a belief rather than evidence;
   `scripts/paymob-national-id-check.ts` settles it against Paymob
   staging. If the answer is no, stop collecting it and question 5
   disappears.
7. ~~Whether to self-host the fonts~~ — done (#75).
8. **OPEN (counsel).** What Law 151/2020 requires for the transfer to
   `eu-west-1`. Shape: adequacy *or* explicit consent, plus a permit
   from the Data Protection Centre. Name the transfer in the policy,
   carry consent through policy acceptance, and confirm the permit
   locally.
9. **OPEN (counsel/accountant).** A retention period. Proposed: account
   lifetime; financial records five years; technical logs about a week.
   **And a gap found while answering it — nothing anywhere mentions
   backups**, so the deletion page's promise and the backup window
   disagree. Wording for all three is in `store/app-privacy.md` §9.
10. **OPEN (one fact).** Supabase's own log retention, plan-dependent
    (~a week on Pro). State it in the policy; do not declare it on
    either store form.
11. **The age rating and content questionnaires** → answer honestly
    using the drafts in `store/play-console.md` and
    `store/app-privacy.md`; target audience **18+** on both stores. The
    rating itself is an output.
12. **Crash reporting** → **on, EU region (`de.sentry.io`), after
    launch**, in a release that updates both store forms with it. The
    privacy cost is unusually low and already paid for: no user context,
    no breadcrumbs, identifiers substituted out, and a test that proves
    it. The region lives in the DSN, so it needs no code change.

**Added while answering these — 13. Paymob is "shared", not merely
processed.** The processor exemption holds when a third party acts only
on your instructions. A regulated financial institution uses a national
ID for its own KYC and AML obligations. Three Financial info rows are
declared shared on both forms.

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
