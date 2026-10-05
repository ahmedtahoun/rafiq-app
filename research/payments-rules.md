# What Apple and Google allow Rafiq to charge, and how

Read from the primary sources on 2026-10-01. Apple's App Review Guidelines
were last updated 2026-06-08. Re-read them before building the purchase flow,
because both stores change these pages.

This is what the published rules say. It is not legal or tax advice. The
questions at the end still need someone qualified to answer them in writing.

## The short version

| What is paid for | iOS | Android | Fee |
|---|---|---|---|
| Rafiq Pro, the coach subscription | **In-App Purchase required** (3.1.1) | **Play Billing required** ("cloud software and services… business productivity software") | 15% on both stores; Apple's needs enrolment, see below |
| A 1:1 **online** session between a member and a coach | Paymob allowed (3.1.3(d)) | Paymob allowed, **if the session is not recorded or replayable** | Paymob 2.75% + EGP 3 |
| A 1:1 or group session **in person** (a dive lesson, a yoga class in a studio) | **Must not** use In-App Purchase (3.1.3(e)) | **Must not** use Play Billing ("physical services") | Paymob |
| A **group** session **online** (one-to-few, one-to-many) | **In-App Purchase required** (3.1.3(d)) | Not exempt as a 1:1 service, so assume Play Billing | 15% |

## Corrections to the strategy papers

**1. "Group sessions, workshops, events → In-App Purchase" is only true when they are online.**
Apple's 3.1.3(d) requires In-App Purchase for one-to-few and one-to-many
*real-time* services. 3.1.3(e) says services "consumed outside of the app"
*must* use another payment method. An in-person workshop, a dive trip or a
studio yoga class is therefore paid through Paymob, not Apple. This matters
for the diving and yoga verticals, which are mostly in person.

**2. Google's 1:1 exemption has a condition the papers do not mention.**
Play's Payments policy FAQ exempts a 1:1 online paid service only when:
- it is between two individuals, and
- it is "not available for replay afterwards", meaning not recorded and not
  accessible again in any Play-distributed app.

Its examples include "health coaching (such as personal trainer sessions or
counseling services)". So **Rafiq must never record sessions or offer
replays** without moving those sessions to Play Billing. Treat recording or
replay as a payments decision, not a feature.

**Since #104 the call is real, and recording is kept out by code rather
than by intention.** This paragraph used to say the Join Session room was
"a preview with no real call"; that stopped being true when 1:1 sessions
moved onto Daily. What holds the exemption now is
`supabase/functions/_shared/sessionVideo.ts`: a room is created without
`enable_recording`, every participant gets a non-owner token (only owners
can start a recording), and before issuing one the function reads the
Daily **domain's** config and returns 503 `recording_enabled_on_domain`
if recording is enabled there — so turning it on in Daily's dashboard
breaks joining rather than silently starting to record. Anyone changing
that file is changing which payment rail these sessions are allowed to
use. The store forms depend on it too (`store/play-console.md` §7,
`store/app-privacy.md`).

**3. The 15% Apple rate is not automatic.**
The App Store Small Business Program needs enrolment: the Account Holder
enrols, accepts the Paid Apps agreement, and lists any associated developer
accounts. The reduced rate takes effect about 15 days after the end of the
month in which enrolment is approved. Enrol before the first subscription is
sold.

**4. Google's 15% is the default for subscriptions in Egypt.**
For markets outside Australia, the EEA, Japan, the UK and the US, Play
charges 15% on auto-renewing subscriptions at any revenue level. New fee
tables (10% + a 5% billing fee) are rolling out in those five regions in
2026, and Google says the rest will follow ("until the announced updated
service fees are rolled out globally"). Check again before pricing.

## What the rules mean for the build

- **The coach cannot be sent to a web page to pay.** Outside the US
  storefront, Apple forbids in-app links or calls to action that lead to
  another way of paying (3.1.1(a), 3.1.3), and Google forbids the same. A
  web subscription is allowed only *as well as* In-App Purchase, not instead
  of it (3.1.3(b), Multiplatform Services). That rules out "sell it on
  rafiqpro.com and keep the 15%" for anyone who would upgrade in the app.
- **The free stand-alone companion route (3.1.3(f)) does not apply.** It
  covers a free app that accompanies a paid *web-based tool*, with no
  purchasing in the app and no calls to action. Rafiq has no web tool.
- **The session-payment flow has to know what kind of session it is.** An
  online session is 1:1 and may use Paymob. An online group session has to
  go through In-App Purchase. Anything in person must not. Today
  `offerings.type` and `offerings.format` (`online` / `in_person` / `both`)
  carry most of this. "Both" will need resolving at booking time before any
  money moves.
- **Paymob prices cards and wallets the same on its published plan**
  (Standard: 2.75% + EGP 3, local). International cards are on the
  Enterprise plan only, "contact sales". If the Red Sea diving idea goes
  ahead, ask Paymob:
  - the international-card rate;
  - whether a euro price can be charged and settled, or only EGP;
  - whether their Marketplace product (collect, then distribute to coaches)
    takes the "is Rafiq holding coaches' money?" question off the table.

## Still for an advisor

1. Confirm the coach subscription is "functionality" under 3.1.1 and not
   covered by an exemption. Get Apple's answer in writing: App Review can
   be asked before submission.
2. Central Bank of Egypt: if Rafiq ever collects a session fee and pays the
   coach, is that a regulated payment activity? Paymob Marketplace may change
   the answer.
3. VAT on the subscription. Apple and Google handle VAT on sales through
   their stores in many countries; confirm whether they do for Egypt. Also
   VAT on any commission.
4. Whether Paymob needs `national_id` for payouts (the staging run, §3 of
   LAUNCH-CHECKLIST).

## Sources

- Apple, App Review Guidelines §3.1 (updated 2026-06-08):
  developer.apple.com/app-store/review/guidelines/
- Apple, App Store Small Business Program:
  developer.apple.com/app-store/small-business-program/
- Google Play, Payments policy: support.google.com/googleplay/android-developer/answer/9858738
- Google Play, Understanding the Payments policy (FAQ, "1:1 online paid
  services"): support.google.com/googleplay/android-developer/answer/10281818
- Google Play, Service fees: support.google.com/googleplay/android-developer/answer/112622
- Paymob, Pricing: paymob.com/en/pricing
