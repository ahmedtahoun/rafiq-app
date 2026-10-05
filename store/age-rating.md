# Apple's age rating questionnaire, answered

Google's content rating is already answered in `store/play-console.md` §3
and its target audience in §4. Apple's questionnaire was the one rating
form nothing in this repo covered, and it is not the form anyone
remembers: **Apple replaced it in 2026.**

Researched 2026-10-05 against Apple's own documentation, which this
sandbox can reach (unlike Google's, which is blocked).

## What changed, and why the old answer in this repo is wrong

The bands are now **4+, 9+, 13+, 16+, 18+**. **12+ and 17+ no longer
exist.** The questionnaire gained four new required sections — *in-app
controls*, *capabilities*, *medical or wellness topics* and *violent
themes* — and, since July 2026, questions about social media
capabilities.

Answering is **mandatory from September 2026** for every new app, update
and notarization submission, so Rafiq cannot submit without it.

`store/app-privacy.md` §8 item 10 says to "expect roughly 12+ on Apple".
That band is gone; this branch corrects it.

---

## In-app controls

| Control | Answer | Why |
|---|---|---|
| Parental Controls | **No** | Nothing in the app restricts content by age |
| Age Assurance | **No** | No age verification anywhere. Signup asks for a name and a focus |

Neither is a problem for an adult service. They are asked of everyone now.

## Capabilities — the section that decides the rating

| Capability | Answer | Why |
|---|---|---|
| Unrestricted Web Access | **No** | The only `Browser.open` in the app is `src/lib/nativeAuth.ts:124`, opening Google's or Apple's sign-in URL in `SFSafariViewController`. One known URL, no address bar, no general browsing |
| Messaging and Chat | **Yes** | Coach↔member threads (`0014`), and 1:1 video sessions through Daily. Apple's definition explicitly covers text, voice and video chat |
| User-Generated Content | **Yes** | Members write reviews that appear on a coach's page and in Discover, signed first name + last initial (`src/lib/ratingData.ts`). Coaches write their own profile, bio and offerings |
| Social Media | **No** — *but read the next section* | |
| Social Media Disabled for Users Under 13 | n/a | Only asked if Social Media is Yes |
| Advertising | **No** | No ad SDK, no ads, no advertising identifier (`store/play-console.md` §2 and §11) |

### The Social Media answer is the one judgement call here

Apple's definition, quoted:

> the ability to redistribute, amplify, or interact with user-generated
> content through a social feed or similar discovery method

**The case for No**, which is what I would answer:

- A member can **write** a review, only for a coach they actually had a
  session with, and only from their own Sessions screen. That is the
  whole of it.
- Nobody can like, reply to, quote, share or report a review. There is
  no mechanism to redistribute or amplify anything.
- Discover is a **marketplace listing**, ranked by goal match — not a
  feed, not chronological, not personalised by what anyone engaged with.
- Messaging is 1:1 inside an existing coaching relationship. There is no
  public posting, no following and no profile wall.

**The case for Yes**, so you can weigh it: Discover is a discovery method,
and reviews are user-generated content displayed through it. Someone
reading the definition strictly could land there.

**What it costs if you answer Yes:** a **Social Media** content
descriptor on the product page, and the app is placed in the **Time
Allowance category for Social Media** — iOS screen-time tooling then
treats Rafiq as a social app. For a paid coaching service that is both
inaccurate and bad for retention.

This is Ahmed's call, not mine. Answering No is defensible on the
mechanics above; write the reasoning down somewhere, because if Apple
disagrees it will come back as a rejection asking you to justify it.

## Medical or wellness

| Descriptor | Answer | Why |
|---|---|---|
| Health or Wellness Topics | **Yes** | Four of the member onboarding focuses are stress, sleep, relationships and life. The app declares Health & Fitness data on both privacy forms. Answering No here would contradict the privacy form |
| Medical or Treatment Information | **None** | The app gives no medical, diagnostic or treatment information and says so in terms, in onboarding and in a dedicated screen. The crisis list is *referral* information — who to call — not treatment |

The second answer is worth a sentence of thought, because the app does
show a crisis-resources screen. It names organisations and, once Ahmed
has dialled them, numbers. That is signposting, not treatment
information, and the "coaching is not therapy or medical advice" copy
exists precisely to keep that line visible. If you would rather be
conservative, **Infrequent** is defensible and costs little.

## Everything else — all None

| Section | Descriptor | Answer |
|---|---|---|
| Mature Themes | Profanity or Crude Humor | None |
| | Horror/Fear Themes | None |
| | Alcohol, Tobacco, or Drug Use or References | None |
| Sexuality or Nudity | Mature or Suggestive Themes | None |
| | Sexual Content or Nudity | None |
| | Graphic Sexual Content and Nudity | None |
| Violence | Cartoon or Fantasy Violence | None |
| | Realistic Violence | None |
| | Prolonged Graphic or Sadistic Realistic Violence | None |
| | Guns or Other Weapons | None |
| Chance-Based | Gambling | No |
| | Simulated Gambling | None |
| | Contests | None |
| | Loot Boxes | No |

None of these is a close call. The app's own copy contains no profanity,
and there is no game of any kind.

**One caveat on the first group.** These describe *the app's own
content*, not what two adults might type to each other in a message. A
chat app is not rated on the worst thing a user could send — that is
what the **Messaging and Chat** capability above declares, and what
reporting and blocking exist for.

---

## What rating to expect

**Don't predict it — App Store Connect calculates it.** With Messaging
and Chat and User-Generated Content both declared, expect **13+ or
higher**, and that is fine for an adult coaching service.

You can override the calculated rating **upward** but not down
("Override to Higher Age Rating"). Whether you should is tangled up with
the next point.

### A gap this turned up: the terms set no minimum age

Apple's own wording:

> If your app has a EULA with minimum age requirements that exceed the
> rating that Apple calculated, you must override to a rating that
> adheres to the requirements.

Rafiq declares a **target audience of 18 and over** on Google Play
(`play-console.md` §4), and the Families-policy reasoning there is
sound — the app collects health data and messages and would fail those
requirements. But the terms themselves, in `src/lib/i18n.ts`, **never
say you must be 18**. There is no eligibility clause at all; a grep for
an age requirement in either language finds nothing.

That is a mismatch worth closing before submission, and it cuts both
ways:

- **If the terms should require 18+** (they almost certainly should,
  given what §4 already argues), add an eligibility clause in both
  languages — and then Apple's rule above means you must override the
  rating to **18+**, not leave it at whatever is calculated.
- **If they genuinely should not**, then the 18+ target audience on Play
  is the thing that is wrong, and §4's reasoning needs revisiting.

Either way it is a decision plus a copy change in `i18n.ts`, which is
Ahmed's file — flagged here, not fixed.

### Apple 13+ next to Google PEGI 3 is not an inconsistency

`store/play-console.md` §3 expects PEGI 3 / ESRB Everyone with
"interactive elements" notices. Two different systems reading the same
app: IARC rates the *content* and flags interaction separately, while
Apple's new capabilities section folds interaction into the band itself.
Both are honest answers to different questions. Don't "fix" one to match
the other.

## Stay consistent with these

If any of these changes, this document is wrong:

- **Target audience 18+** on both stores (`play-console.md` §4). The
  rating is about content; the target audience is about who it is for.
  They are allowed to differ and here they do — but see the eligibility
  gap above, which is a real inconsistency rather than an allowed one.
- **Health & Fitness declared** on both privacy forms — which is why
  Health or Wellness Topics is Yes.
- **No ads, no advertising ID** (`play-console.md` §2, §11).
- **Nothing is sold in the app today.** If Rafiq Pro Plus ships as a real
  purchase, re-answer Google's "Is there an in-app purchase?" (§3 of
  `play-console.md` flags this already). Apple's questionnaire does not
  ask, but the listing does.
- **Reporting and blocking ship, and get acted on.** Apple requires all
  three for any app with UGC or messaging, and the capabilities answered
  Yes above are what makes that requirement bite.

## What I could not verify

- **How Apple's system computes the final band** from these answers.
  Apple documents the inputs, not the arithmetic, so "expect 13+ or
  higher" is inference from the Social Media minimum, not a quoted rule.
  The real answer appears in App Store Connect the moment you finish the
  questionnaire — take that over this paragraph.
- **Whether a reviewer would read Discover + reviews as a "social feed".**
  Argued above from the app's mechanics; no Apple precedent for a
  marketplace with reviews was reachable from here.
