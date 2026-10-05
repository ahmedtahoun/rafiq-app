# For lawyer review — everything with legal weight

One page, so nothing is reviewed twice and nothing is missed. Every text
below is user-facing and in both English and Arabic; the Arabic is written,
not translated, and needs reading on its own terms rather than as a
comparison to the English.

Prepared 2026-10-05. Nothing here has been reviewed by counsel yet.

**Read the questions in §3 first.** Four of them change the wording of the
documents rather than merely annotating them, so answering them before
reading the drafts in detail saves a pass.

---

## 1. The documents

Eight policy texts, four documents × two languages. The app has a separate
policy and separate terms for coaches and for members, because they are in
different positions: a coach runs a business on the platform and is paid
through it; a member buys coaching and shares health information.

| Document | Where a reader sees it | Source |
|---|---|---|
| Privacy policy — coaches, EN + AR | In-app: Profile → Privacy Policy. Public: `/privacy/`, `/ar/privacy/` | `src/lib/i18n.ts`, `privacySection1–10` |
| Privacy policy — members, EN + AR | In-app: Profile → Privacy Policy. Public: same pages, second half | `src/lib/i18n.ts`, `clientPrivacySection1–10` |
| Terms of service — coaches, EN + AR | In-app: Profile → Terms of Service. Public: `/terms/`, `/ar/terms/` | `src/lib/i18n.ts`, `termsSection1–6` |
| Terms of service — members, EN + AR | Same | `src/lib/i18n.ts`, `clientTermsSection1–6` |

Plus three shorter texts that carry as much weight as the four above:

| Text | Where | Source |
|---|---|---|
| **Coaching service agreement** — the waiver a member signs before working with a coach | In-app, at the start of a coaching relationship | `AGREEMENT_TEXT`, `src/lib/mockStore.ts` |
| **"Coaching is not therapy"** and the crisis lines — the one page reachable with no account and no app | Foot of both Terms documents, both languages, and the public terms page | `termsNotTherapyBody`, `clientTermsNotTherapyBody`, `src/lib/crisisResources.ts` |
| **Account deletion page** — what deletion does, what is kept, and what blocks it | Public: `/delete-account/`, `/ar/delete-account/`. Google Play requires this URL as a condition of listing | `site/copy.mjs` |

### How to read them

The public pages are the easiest way, once the site is hosted
(`LAUNCH-RUNBOOK.md` §1). Until then they can be opened from disk:
`site/public/privacy/index.html` and the `ar/` copies, which are generated
from the same source as the in-app screens, so there is only ever one
wording to review per language.

## 2. What changed in this round, and why

The privacy policies grew from six sections to ten. The four new ones exist
because the app does things the policy did not mention:

- **Notifications** — the app will send push notifications, which means the
  device hands over a notification token. **Not shipped yet** (it arrives
  with #135/#137), so this section describes something that is not live
  today. It must not be published ahead of the feature.
- **Where your data is held** — the database is hosted by Supabase on
  servers in Ireland, so data about Egyptian users leaves Egypt. The policy
  never said so.
- **How long we keep it** — there was no retention period at all.
- **Deleting your account, and backups** — the deletion page promises
  deletion, and encrypted backups outlive it. Nothing anywhere mentioned
  backups. This was found while answering the store privacy forms and is
  the single most likely thing to be read as an overstatement.

Video sessions were **already** covered in both policies, in both
languages: the call runs through Daily, passes through its servers while it
happens, and is never recorded or stored. No change was needed there, and
none was made.

## 3. Open questions

The first four are counsel's to answer and change the text. The last two
are ours to confirm, and are listed so nobody reviews a number that is
about to move.

### q7 — Law 151/2020 and the transfer to Ireland
Does moving personal data of people in Egypt to servers in the EU require a
permit from the Data Protection Centre, and is one obtainable? The policy
currently relies on consent: *"By using Rafiq Pro you agree to that
transfer."* That sentence is a placeholder for whatever the right basis
is — consent bundled into use of a service is contested ground, and we
would rather be told than guess. This is the question with the largest
effect on the product: if the transfer is not permissible, the hosting
region changes, not the wording.

### q2 — May a member see their coach's private notes about them?
Coaches write notes about members. Our working assumption is that a member
can ask for them and must receive them. The exposure is not the answer but
that **coaches do not currently know** — nothing in the coach terms or by
the notes field says so. If the assumption holds, that is a product change
and a line of copy, not just a clause.

### q8 — Is five years the right retention period for financial records?
Proposed, and written into both policies: account lifetime for everything;
five years for sessions, payments and payouts, stripped of identifying
details; technical logs about a week. **The five is a guess at Egyptian tax
and commercial law.** Please confirm or replace it.

### The coaching service agreement
A waiver signed inside the app. Three questions on it: whether the English
is enforceable as drafted, whether the Arabic says the same thing in a way
that is enforceable in Egypt, and whether a tap is adequate evidence of
signature. It was English-only for Arabic-speaking members until this
round, which may affect anything already signed.

### q9 — log retention (ours to confirm)
"About a week" is Supabase's figure for the Pro plan and the plan has not
been bought yet. The number may move slightly.

### q13 — the Google Data safety form (ours, and not a policy question)
Whether a live video call needs declaring as collected audio and video on
Google's form. Apple's form is settled; Google publishes no equivalent
exemption. Recorded here only so it is not mistaken for an open legal
question. `store/play-console.md` §7 has it.

## 4. What we are not asking

- **The store privacy forms themselves** (`store/app-privacy.md`,
  `store/play-console.md`). Those are declarations to Apple and Google,
  already reasoned out, and they follow the policy rather than the other
  way round. If the policy changes, they change with it.
- **The crisis telephone numbers.** Every one is unconfirmed and renders as
  "number not confirmed yet" until someone has dialled it
  (`research/crisis-lines.md`). That is an operational task, not a legal
  one — but the *wording* around them, on a page people reach in a crisis,
  is worth a reading.

## 5. If something is wrong

Policy and terms copy lives in `src/lib/i18n.ts`, English and Arabic side
by side, and the public pages are generated from it by `npm run build:site`
— so a correction is made once per language and lands in all four places.
Mark up whichever form is easiest to mark up; it will be transcribed.
