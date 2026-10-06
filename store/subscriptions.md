# Store subscription products — what to create, and where

The four paid plans as App Store Connect and Play Console need them, for
the **first update after launch**. Nothing here ships at launch: the
Subscription screen shows all three plans with "Coming soon" and nothing
is purchasable (`store/review-notes.md` §2 step 18).

Prices and caps are Ahmed's decision of 2026-10-05, already in the app and
the database (0024): Free 3 active members, **Rafiq Pro Plus** 450 EGP/month
or 4,500/year at 15, **Rafiq Elite Pro** 900/month or 9,000/year unlimited.

**Everything in this file is Proposed** — product IDs, display names and
descriptions are drafts for Ahmed to approve in the consoles.

## How the two stores disagree, and what that means for "four products"

This is the first thing to know, because the brief for this file assumed
four products on both sides and that is only true of Apple.

| | App Store Connect | Play Console |
|---|---|---|
| What you create | **4 auto-renewable subscriptions** in **1 subscription group** | **2 subscriptions**, each with **2 base plans** (monthly, yearly) |
| Why | A group holds one subscription per price point; duration is a property of the product | Since May 2022 a subscription says *what* the user gets, and its base plans say *how* it is sold |
| So | `…proplus.monthly`, `…proplus.yearly`, `…elitepro.monthly`, `…elitepro.yearly` | 2 product IDs, 4 base plan IDs |

Creating four separate Play subscriptions would be the old model and the
thing the 2022 change exists to stop: Google's own reasoning was that
developers otherwise had to keep the benefits and descriptions identical
across products and stop users buying two at once.

> Starting in May 2022, a subscription's benefits (in other words, "what"
> the subscription provides) are defined separately from its base plans and
> offers ("how" the subscription is sold). Each subscription can have
> multiple base plans, each with multiple offers.

⚠️ **Read second-hand.** `support.google.com` is blocked by this sandbox's
egress proxy, so every Play fact in this file comes from search summaries
of Google's pages and from RevenueCat's engineering write-up, not from
Google's documentation directly. **Ahmed should confirm the Play half in
the console itself**, where the form will simply show whether base plans
exist. The Apple half was read first-hand and is cited inline.

---

## 1. The products

### App Store Connect — one group, four subscriptions

**Subscription group reference name:** `Rafiq plans`
**Group display name (localized, shown on the App Store):**

| | |
|---|---|
| English | `Rafiq plans` |
| العربية | `خطط رفيق` |

| Product ID | Duration | Price | Level |
|---|---|---|---|
| `app.rafiqie.coach.proplus.monthly` | 1 month | 450 EGP | 2 |
| `app.rafiqie.coach.proplus.yearly` | 1 year | 4,500 EGP | 2 |
| `app.rafiqie.coach.elitepro.monthly` | 1 month | 900 EGP | 1 |
| `app.rafiqie.coach.elitepro.yearly` | 1 year | 9,000 EGP | 1 |

**Levels, and why they are set this way.** Within a group, level is the
upgrade order: level 1 is the highest. Elite Pro above Pro Plus makes
Pro Plus → Elite Pro an *upgrade* (immediate, prorated) and Elite Pro →
Pro Plus a *downgrade* (at the next renewal), which is what the terms
clause 7 in `store/LEGAL-DRAFTS.md` describes. The monthly and yearly of
the same tier share a level, so switching between them is a crossgrade
rather than a loss of access. ⚠️ **Not verified first-hand** — the level
semantics are from memory, not from a page I could read today. The form in
App Store Connect labels the field, so confirm there.

**Duration is permanent.** Apple: the possible durations are 1 week,
1 month, 2, 3 and 6 months and 1 year, and *"Duration cannot be changed
after submission for review"* ([Auto-renewable subscription information](https://developer.apple.com/help/app-store-connect/reference/auto-renewable-subscription-information),
read 2026-10-06). So a wrong duration means a new product, not an edit.

### Play Console — two subscriptions, four base plans

| Product ID | Base plan ID | Billing period | Price |
|---|---|---|---|
| `app.rafiqie.coach.proplus` | `monthly` | P1M | 450 EGP |
| `app.rafiqie.coach.proplus` | `yearly` | P1Y | 4,500 EGP |
| `app.rafiqie.coach.elitepro` | `monthly` | P1M | 900 EGP |
| `app.rafiqie.coach.elitepro` | `yearly` | P1Y | 9,000 EGP |

Both base plans **auto-renewing**, not prepaid. No introductory offers at
launch — an offer is a separate object under a base plan and can be added
later without touching either.

⚠️ **The whole Play half is second-hand** (see the note at the top). In
particular: that base plan IDs are lowercase with hyphens, that the
billing period is an ISO-8601 duration, and that a subscription must carry
at least one base plan — all from search summaries of Google's pages, none
read directly. Confirm in the console.

---

## 2. Display names and descriptions

Apple's display name *"appears on the App Store and can be localized"*,
and **must not contain** *"control characters (null, new lines, carriage
returns, escape, invisible characters) or markup language (HTML tags,
Unicode characters such as emoticons, diacritics, or special characters)"*
([same reference](https://developer.apple.com/help/app-store-connect/reference/auto-renewable-subscription-information),
read 2026-10-06).

⚠️ **"Diacritics" is worth a thought for the Arabic.** Read strictly it
would rule out ـً ـٌ ـَ ـُ and the like. The Arabic below carries none, so
the question does not arise — but do not add any for emphasis later.

⚠️ **Character limits not verified.** 30 for the display name and 45 for
the description are widely repeated and match what the form enforces in
practice, but I could not read them on an Apple page from this sandbox —
the one that should carry the table truncates before it. Every draft below
is **within 30 and 45** so the limits do not matter if they are right, and
the console will say if they are tighter.

### Pro Plus monthly

| Field | English | العربية |
|---|---|---|
| Display name | `Rafiq Pro Plus, monthly` (23) | `رفيق برو بلس، شهريًا` (20) |
| Description | `Up to 15 active members. Renews monthly.` (40) | `حتى 15 عضوًا نشطًا. يتجدد شهريًا.` (33) |

### Pro Plus yearly

| Field | English | العربية |
|---|---|---|
| Display name | `Rafiq Pro Plus, yearly` (22) | `رفيق برو بلس، سنويًا` (20) |
| Description | `Up to 15 active members. Renews yearly.` (39) | `حتى 15 عضوًا نشطًا. يتجدد سنويًا.` (33) |

### Elite Pro monthly

| Field | English | العربية |
|---|---|---|
| Display name | `Rafiq Elite Pro, monthly` (24) | `رفيق إيليت برو، شهريًا` (22) |
| Description | `Unlimited active members. Renews monthly.` (41) | `أعضاء نشطون بلا حد. يتجدد شهريًا.` (33) |

### Elite Pro yearly

| Field | English | العربية |
|---|---|---|
| Display name | `Rafiq Elite Pro, yearly` (23) | `رفيق إيليت برو، سنويًا` (22) |
| Description | `Unlimited active members. Renews yearly.` (40) | `أعضاء نشطون بلا حد. يتجدد سنويًا.` (33) |

**Why the duration is in the display name.** Apple's guidance on
in-app-purchase names elsewhere says not to put duration in a *publication*
name, while subscription display names conventionally carry it — and these
four are otherwise indistinguishable to a user comparing them on the App
Store. ⚠️ Flagged rather than resolved: I could not find a page stating
which rule governs an auto-renewable subscription's display name. If
review objects, the fallback is `Rafiq Pro Plus` for both durations, since
the duration is also a field of its own.

**Counts are characters, counted on the strings above**, not estimates.
Arabic is counted in characters, not bytes, the same way `store/listing.md`
counts it.

---

## 3. What each product needs for review

### Apple: a review screenshot, per subscription

Each auto-renewable subscription carries its own **review screenshot** —
it is not shared across the group, so four are needed. Its job is to show
the reviewer where in the app this product is sold, which is the same
place for all four: **Profile → Your plan**.

⚠️ **Not verified first-hand**: that the screenshot is required per
subscription rather than per group, and its pixel requirements. The field
is on the form; confirm when filling it.

What the screenshot must show, which is a real dependency rather than a
formality:

* the plan cards with **450 / 4,500 / 900 / 9,000 EGP** visible
* the **period** beside each price
* the words that make it auto-renewing, and how to cancel
* the **Terms** and **Privacy** links

**None of that is on the screen today** — it says "Coming soon" and has no
disclosure block (§4). So the screenshot cannot be taken until the
Subscription screen is built for billing. That is the real ordering
constraint in this file: screen first, then screenshots, then products.

### Apple: review notes, per product

One note, the same for all four but for the first line:

> This subscription raises the limit on how many active members a coach can
> have: Rafiq Pro Plus allows 15, Rafiq Elite Pro has no limit. The free
> plan allows 3.
>
> To see it: sign in with the coach test account in App Review Information,
> open Profile → Your plan. The plan cards and the renewal terms are on
> that screen, with links to the Terms of Service and the Privacy Policy.
>
> Nothing outside the app is needed, and no content is unlocked that is not
> described on that screen. A coach's existing members are never removed if
> a plan ends or is downgraded — only adding a new member past the limit is
> refused.

That last paragraph is there because it is the question a reviewer asks of
a cap-based subscription: what happens to what I already had. The answer
is enforced in the database (0024's `coach_member_cap`, 0020's trigger),
not just promised.

### Play: one listing per subscription

⚠️ Second-hand, as above. Each Play subscription needs a name and a
description per language; the base plans beneath it carry no copy of their
own, only period and price. So Play gets **two** descriptions, not four,
and they must not name a period:

| Field | English | العربية |
|---|---|---|
| Pro Plus name | `Rafiq Pro Plus` | `رفيق برو بلس` |
| Pro Plus description | `Up to 15 active members, with everything in the free plan.` | `حتى 15 عضوًا نشطًا، مع كل ما في الخطة المجانية.` |
| Elite Pro name | `Rafiq Elite Pro` | `رفيق إيليت برو` |
| Elite Pro description | `Unlimited active members, featured placement in Discover, and earnings export.` | `أعضاء نشطون بلا حد، وظهور مميز في «اكتشف»، وتصدير الأرباح.` |

⚠️ **The Elite Pro description names two features beyond the member
cap. Both are built. Neither can be bought yet.** The in-app card marks
each with a "Coming soon" badge (`Subscription.tsx:42`,
`soon: ['subscriptionEliteFeature3', 'subscriptionEliteFeature4']`), and
that badge is about the plan rather than the feature: nothing charges for
Elite Pro until billing ships. A **store description carries no badge**, so
the listing states flatly what the card qualifies.

* **Earnings export** shipped in #162: a coach whose tier is `elite_pro`
  gets the export button on Earnings, built client-side from the ledger the
  screen already reads.
* **Featured placement** is granted by `0027` — in #164, open as this is
  written. `coach_directory.featured` becomes `cp.featured or` an active
  Elite Pro plan (tier `elite_pro`, `renews_at` null or still to come), so
  the coach is listed first in Discover, and labelled, from the moment the
  tier is granted, and stops being listed first as soon as the plan lapses,
  with nothing to run. `directory.ts:162` already sorted on the column
  (0005, 0022); what was missing was anything that set it.

So both of the description's claims are true of the plan. What is not yet
true is that anyone can buy it — and the products cannot go live before
billing in any case, so the listing and the card do not contradict each
other: the listing describes what the plan grants, the card says the plan
is not for sale yet. `store/listing.md` §"What the listing may and may not
claim" is the test either way, and both claims now pass it.

**The badge question this section raised is answered: the badges stay.**
#162 made `subscriptionEliteFeature4`'s "Coming soon" look stale, and this
file asked whether to drop it. Two written sources settle it — `0027`'s
header ("until billing ships, a tier is granted by hand … and the Elite Pro
card keeps its 'Coming soon' tag on this feature") and #164's rewrite of
`tests/free-plan.spec.js` ("Nobody can buy Elite Pro until billing ships,
so featured placement (0027) and the CSV export (#162), both built, each
keep their own tag"). Read that way the badge says *not purchasable*, not
*not built*, which is equally true of feature 3 and feature 4, so neither
comes off. Worth revisiting when billing ships, and not before.

---

## 4. Apple's disclosure requirements, and where the app must show them

### What the guideline actually says

Guideline 3.1.2(c) does **not** enumerate the disclosures. In full:

> **3.1.2(c) Subscription Information:** Before asking a customer to
> subscribe, you should clearly describe what the user will get for the
> price. How many issues per month? How much cloud storage? What kind of
> access to your service? Ensure you clearly communicate the requirements
> described in Schedule 2 of the Apple Developer Program License Agreement.

([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
read 2026-10-06.) So the list lives in **Schedule 2 §3.8(b)**, and anyone
looking for it in the guidelines will not find it.

### The list

Per Apple's August 2024 update to Schedule 2 §3.8(b), a developer must
clearly and conspicuously disclose:

* the **title** of the auto-renewing subscription — may be the same as the
  in-app product name
* the **length** of the subscription
* the **price**, and the **price per unit** if appropriate
* **links to the Privacy Policy and Terms of Use**, accessible *within the
  application*

And on placement: the information must appear during the purchase flow
without the user having to take another action such as opening a link; it
is required **in the app and in the app's description**; and putting it on
the StoreKit modal alert is **not sufficient** — it has to be in the app
itself as well.

⚠️ **Read second-hand.** Schedule 2 is served as a 654 KB page that
truncates long before §3.8(b) from this sandbox, so the wording above is
RevenueCat's summary of Apple's update
([Schedule 2, section 3.8(b) — August 2024 update](https://www.revenuecat.com/blog/schedule-2-section-3-8-b/),
read 2026-10-06), not Apple's own text. **Before submitting, read §3.8(b)
in the agreement itself** — it is in App Store Connect under Agreements,
Tax and Banking, and it is the binding version.

### Where Rafiq must show it

| Requirement | Where it goes | Built? |
|---|---|---|
| Title, length, price per plan | The three plan cards, Profile → Your plan | **Partly** — the cards show price and period; "Coming soon" sits where a buy button goes |
| Auto-renews, and how to cancel | A block under the cards on the same screen | **No.** Clause 7 of `store/LEGAL-DRAFTS.md` is the drafted text, in both languages, and it is not in `i18n.ts` yet |
| Links to Terms and Privacy | The same screen, as links | **No.** Both documents exist in-app (Profile → Terms / Privacy) but the Subscription screen does not link to them |
| The same facts in the App Store description | `store/listing.md` | **No.** The description predates the plans and says nothing about them |

So three of the four are open, and all three are the same piece of work:
the Subscription screen as billing needs it. That work is the gate on
everything in this file, and it is why the review screenshots cannot be
taken yet.

---

## 5. The order to do it in

1. **Build the Subscription screen for billing** — plan cards with price
   and period, the auto-renew and cancellation block, Terms and Privacy
   links. Nothing else here can start.
2. **Featured placement — settled, pending #164's merge.** `0027` grants
   `featured` to a current Elite Pro plan, so the Elite Pro description's
   claim stands: nothing to cut from it or from the plan card.
3. **Add the plans to the App Store description** and the Play listing
   (`store/listing.md`).
4. **Create the products**: Apple's group and four subscriptions; Play's
   two subscriptions and four base plans.
5. **Take the four review screenshots** from the finished screen, and fill
   the review notes.
6. **Read Schedule 2 §3.8(b)** in App Store Connect and check the screen
   against the binding wording, not against §4 above.
7. Submit the products with the build that contains the screen. Apple
   reviews in-app purchases with a build; they cannot be approved alone.
   ⚠️ Not verified from a page today.

## What is not in this file

* **Prices in other currencies.** Both stores will propose a matrix from
  the EGP price. Whether Rafiq sells outside Egypt at launch is Ahmed's
  call and changes nothing above.
* **Introductory offers and free trials.** Neither store needs them to
  create the products, and both can be added later.
* **The tax and banking setup.** §5 of the checklist, and a prerequisite
  for selling anything rather than for defining it.
* **RevenueCat or any other billing wrapper.** Checklist §3 names it as a
  possibility; nothing here assumes one.
