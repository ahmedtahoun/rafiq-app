# App Review notes and the pre-submission run-through

Two things in one file, because the second produces what the first needs:

1. **The pass before every submission** (checklist §11): two real accounts,
   both roles, end to end. The accounts it leaves behind, with real data in
   them, are the reviewer accounts.
2. **The notes for the reviewers:** Apple's *App Review Information* and
   Google's *App access*. Sign-in is only through Google and Apple, so a
   reviewer can't get past the first screen without them.

Written against the app on 2026-09-30. Labels are quoted from
`src/lib/i18n.ts` (English); check them again if a screen has changed.

---

## 1. Before you start (Ahmed)

- [ ] **Two Google accounts made for review**, used for nothing else, for
      example `rafiq.review.coach@gmail.com` and
      `rafiq.review.member@gmail.com`. **Turn 2-Step Verification off** on
      both: a reviewer can't receive your codes, and Google blocks unknown
      devices on accounts that have it. Store the passwords in the password
      manager, not in this repo.
- [ ] **Unlist the review coach, before any real member can see them.**
      `coach_directory` (0005) lists every active coach who finished
      onboarding, so without this the review coach appears in every real
      member's Discover — with its seeded 5-star review — and can be booked
      or reported by them. `0022` adds the switch; it is dashboard-only, so
      a coach cannot set it from the app:

      ```sql
      update public.coach_profiles set unlisted = true
      where profile_id = (select id from public.profiles where email = '<review coach email>');
      ```

      The coach still sees their own page, and so do their own members, so
      nothing in the run-through below breaks. `supabase/admin/README.md`
      has the query for checking who is unlisted.

      Do this **before** the first submission, not after: `review-accounts.sql`
      refuses to run once a real member has joined the review coach's
      roster, asked them for a session or reported them — deliberately,
      because a reset would erase that member's rows and a report is
      moderation evidence. Unlisting first is what keeps you out of that
      state.
- [ ] The redirect URL `app.rafiqie.coach://auth-callback` is in Supabase →
      Auth → URL Configuration (checklist §4), or native sign-in fails.
- [ ] The build under test is the store build (TestFlight or Play internal
      testing), not a local one (`RELEASE.md` §4).
- [ ] **Their data:** after both accounts have signed in once (coach
      onboarded), run **Reset review accounts**
      (`supabase/admin/review-accounts.sql`, see `supabase/admin/README.md`).
      It gives the pair a relationship with sessions, tasks, messages and a
      program, which the run-through below then exercises. Run it again
      after the run-through and after each review, to put back whatever was
      changed.

      **It does not seed a session you can join.** Its three sessions are
      14 days ago, 7 days ago and 3 days out; the video room only opens ten
      minutes before a session starts (`JOIN_EARLY_MS`). Step 17 makes one,
      and it has to be made on the day.

      **Its hours decide when you can do step 18 at all.** The script seeds
      availability 10:00–18:00 Cairo on Saturday–Wednesday. Outside that
      the coach has no free slot for the member to book into, so plan the
      run-through for a Sat–Wed daytime or widen the hours on Availability
      first.

## 2. The run-through

Do it once in English on an iPhone and once in Arabic on an Android phone.
Switch one of the two runs to dark mode. Each step says what must be true
before moving on. Stop and file a bug at the first step that isn't.

### Coach (review coach account)

1. Fresh install → the Welcome carousel → **Skip** works (it sat under the
   status bar once) → **Continue with Google** → sign in → **"I'm a Pro"**.
2. Finish onboarding: specialty, experience, a real-looking bio, a photo
   (Edit profile → camera *and* library both work, and nothing crashes on
   the permission prompt).
3. Add one offering with a price, and the weekly hours.
4. **New Member** → save a member with a name → open them →
   **Invite them** → copy the code. Keep the code for step 10.
5. Add a task to that member (**New Task**) and a session on the Schedule.
6. Close the app completely and reopen it: still signed in, everything
   still there.

7. **Profile → Your plan.** Three cards: Free (3 active members),
   Rafiq Pro Plus (450 EGP/month or 4,500/year, 15 members) and Rafiq
   Elite Pro (900/month or 9,000/year, unlimited). **Nothing here is
   purchasable in this version** and nothing should look as though it
   ought to be:

   - every card above the current plan carries a **Coming soon** badge and
     the line *"Upgrading opens once billing goes live in the app"*;
   - there is **no buy, subscribe or restore button** anywhere on the
     screen, and no price is tappable;
   - two Elite Pro features carry their own **Coming soon** badge, because
     they are not built either.

   This is the screen most likely to be read as a broken purchase, so §3's
   notes say so in as many words. If a reviewer can tap anything that
   looks like a purchase, that is a bug worth stopping for — the build
   contains no in-app purchase products at all, so a tap could only lead
   somewhere wrong.

### Member (review member account, on the other phone)

8. Fresh install → **Continue with Google** → **"I'm a Member"** →
   onboarding: pick a focus, and **the "Coaching is not therapy" notice
   and the crisis list open** from the foot of the form.
9. Home shows the no-coach state → **I have an invite code**.
10. Enter the code from step 4, typed in lower case with a space in it (it
   has to be accepted) → **Join {coach}?** → join.
11. The task and the session from step 5 are there, with the right day and
    time. Times in Cairo are the easy thing to get wrong: a 6 PM session
    must say 6 PM.
12. Tick the task → on the coach's phone the member's record shows it done.
13. Discover → the coach from step 2 is listed → their page → request a
    session at a free time → **Request sent!**

    The coach is unlisted (§1) and still appears here, which is correct
    rather than a leak: `coach_directory` returns an unlisted coach to
    the coach themselves and to anyone on their roster, and step 10 put
    this member on it. Signed in as any *other* member, this coach is not
    in Discover at all — worth confirming once from a throwaway account,
    since it is the whole point of unlisting them.
14. Coach: Notifications → **Accept**. Member: the session appears, and so
    does the notification.
15. **Message** the coach → it appears on the coach's phone without a
    refresh → reply → it appears on the member's.
16. **The unread badge and the chime** (#128). With the coach's phone on a
    screen that is *not* the thread — Home will do — send a message from
    the member. The coach's phone **plays a sound** and the **Messages**
    tab shows a count. Open the thread: the count clears. Then the other
    way round, where the member's badge sits on **Your Pro**.

    Two things that should *not* happen, and are the reason this step
    exists: no sound while the thread is already open on screen, and no
    sound if notifications are off (the coach's main switch, the member's
    Messages switch — Profile → Preferences). A banner with the app
    **closed** is a phone notification and is not in this version.
17. Member: ask to move the session → coach accepts → both see the new time.
18. **A video session, both ends.** Nothing seeded is joinable — see §1 —
    so make one:

    - Coach: **Schedule** → add a booked session starting in the next few
      minutes, with the review member.
    - Both phones: open the session. **Join** is disabled until ten
      minutes before the start, then enables.
    - Both tap Join. Grant camera and microphone when asked — the prompts
      should read in the app's language. Each side sees and hears the
      other.
    - Leave from one side; the other is told. Rejoin works.

    Worth doing once on **cellular**, not Wi-Fi: it is the condition a
    reviewer is most likely to be on and the one least tested.

    If the room says it is unavailable rather than opening, that is the
    app refusing to start a call on a Daily domain or room with recording
    switched on (`recording_enabled_on_domain` / `recording_enabled_on_room`,
    `src/lib/videoData.ts`). It is the guard working, not a bug — fix it in
    the Daily dashboard, not in the app.
19. Coach: mark a past session attended. Member: **Rate Session** → the
    review shows on the coach's page signed with first name and last
    initial, never a full name.
20. Member: **Report a problem** on the coach → **Report submitted**. It
    appears in the open-reports query (`supabase/admin/README.md`).
21. Member: **Block** in the thread → neither side can send; unblock →
    both can.
22. Airplane mode on either phone → an error with a retry, never a blank
    screen or demo data → back online → retry works.
23. Android: the hardware back button walks back through screens and only
    leaves the app from a tab root.

24. **Phone notifications.** They are off until someone turns them on, and
    **Rafiq never asks at launch** — the request follows the app's own
    explanation, on the first message sent or received or the first session
    booked, or a tap on **Turn on** in Profile. So:

    - Expect **no OS prompt on first run.** If one appears before any
      message or booking, that is a bug.
    - Send a message between the two phones. The explanation sheet appears,
      then the OS prompt. Allow on one phone, choose **Not now** on the
      other.
    - The phone that allowed gets a banner for the next message **while the
      app is closed**; tapping it opens that thread, not just the app.
    - **Nothing appears while the app is open** — whatever the banner would
      say is already on screen.
    - The phone that chose Not now is **never asked again**, and its
      Profile row offers Turn on. That is correct, not a stuck prompt.
    - Turn a category off in Profile → the banners for it stop; back on →
      they resume.
    - A **message banner never contains the message** — only who it is
      from. That is deliberate (`pushSend.ts`: "lock screens are public")
      and worth a look, since a reviewer may read it as a bug.
25. **A session reminder.** ⏳ **Nothing arrives until pg_cron is switched
    on** (#154: Dashboard → Database → Extensions → pg_cron, then
    `select public.schedule_session_reminders();`). Once it is: book a
    session 45–60 minutes out and both phones get one banner each, in their
    own language. Skip this step until then rather than filing a bug.
26. **The coach's public page.** ⏳ **A reviewer cannot see one yet** —
    the page is served from `rafiqpro.com/c/<code>` and the site is not
    hosted (§5 of the checklist), and the in-app switch that mints the code
    is #160, still open. Once both are done: Share → turn the page on →
    open the link in a browser **signed out**. It must show the name,
    title, bio, languages, starting price and — only from three reviews —
    the rating, and must show **no email, no phone, nothing about members,
    no review text and no photo**. Turning it off must make the same URL
    say "not available", not 404 with a different message.

### Deletion (on a third, throwaway account, not the review accounts)

27. Sign up a throwaway member, link it to the review coach, then
    **Delete Account** → confirm → the request shows in pending deletions →
    process it (`account-deletion` function) → the login is gone, and the
    coach's record keeps the sessions without the name.

Anything that fails blocks the submission. When it all passes, run **Reset
review accounts** once more: the run-through blocked, reported and added
things, and the reviewers should start from the clean set.

---

## 3. Apple: App Review Information

App Store Connect → the version → **App Review Information**.

- **Sign-in required:** yes.
- **User name / Password:** the *coach* review account, from the password
  manager. Put the member account in the notes below.
- **Contact:** Ahmed's name, phone and `support@rafiqpro.com`.
- **Notes** (paste, then fill in the member account):

> Rafiq Pro connects coaches (life, career, wellness) with the people they
> coach. There are two roles, chosen once after signing in.
>
> Sign-in is through Google or Sign in with Apple only. Two Google
> accounts with data in them are provided:
> - Coach: the account above.
> - Member: [member email] / [member password]
>
> To see each role, choose "Continue with Google", sign in with that
> account, and pick "I'm a Pro" (coach) or "I'm a Member". The two accounts
> are linked: the member sees the coach's tasks and sessions, and they can
> message each other. Sign in with Apple also works, but a new Apple
> account starts empty.
>
> Payments: coaching sessions are person-to-person live services
> (guideline 3.1.3(d)). No payment is taken in the app in this version:
> booking sends a request the coach accepts. **There are no in-app
> purchase products in this build at all.**
>
> The coach's Profile → Your plan screen lists three plans — a free one and
> two paid — with their prices, so a coach can see what is coming. Every
> plan above the current one is marked "Coming soon", and there is no buy,
> subscribe or restore control anywhere on that screen: billing is planned
> for the first update after this one. Nothing on the screen is tappable as
> a purchase.
>
> User-generated content (guideline 1.2): members can report a coach from
> the coach's page ("Report a problem"), and either side can block the
> other from the message thread ("Block"). Reports are reviewed by the
> Rafiq team.
>
> Video sessions: a booked session can be held on video inside the app,
> through Daily (daily.co), our video provider. The call is 1:1 between
> the coach and that member, the Join button opens ten minutes before the
> start, and **sessions are never recorded** — the app refuses to open a
> call at all if recording is enabled on the room. Camera and microphone
> are requested at that point and nowhere else.
>
> To see one: both accounts are on each other's schedule. Add a session
> starting within the next ten minutes from the coach's Schedule, then tap
> Join on both.
>
> Account deletion (5.1.1(v)): Profile → Delete Account.
>
> Coaching is not therapy or medical advice. This is stated in the terms
> and during member onboarding, with crisis resources.
>
> Push notifications are optional. The app asks only after explaining why
> (on the first message sent or received, or the first session booked),
> never at launch, and Profile → Notifications turns them
> on or off. Everything they say is also shown inside the app. **A message
> banner never contains the message** — only who it is from — because a
> lock screen is public.
>
> A coach can also give themselves a page on the open web, off by default,
> turned on from Share. It shows what they chose to publish about their
> practice and nothing about any member. ⬚

⚠️ Four things in those notes depend on work that is still open. Check
them before pasting:
- "No payment is taken" and "no in-app purchase products in this build":
  true while billing is unbuilt. Both become false the moment the products
  in `store/subscriptions.md` are created and a build ships with the
  purchase flow — and then step 7 of §2 changes too. If Paymob for sessions
  ships first, rewrite that paragraph.
- "Reports are reviewed": the response time isn't stated yet
  (LAUNCH-CHECKLIST §9).
- The public page paragraph ends in a `⬚`. Before submitting, replace it
  with either a live code for the reviewer to open, or a sentence saying
  the page cannot be reached yet — true while rafiqpro.com is unhosted
  (§5) and while the in-app switch is unmerged (#160). **Do not submit
  with the placeholder in it.**
- Step 25, the session reminder, is **skippable until pg_cron is switched
  on** (#154). A reviewer told to expect a reminder that never arrives
  reads it as a broken feature, so leave that step out until it is on.

## 4. Google Play: App access

Play Console → App content → **App access** → "All or some functionality
is restricted" → add two sets of instructions, one per role:

- **Name:** Coach. **Username / password:** the coach review account.
  **Other information:** "Choose Continue with Google, sign in, and pick
  'I'm a Pro'."
- **Name:** Member. **Username / password:** the member review account.
  **Other information:** "Choose Continue with Google, sign in, and pick
  'I'm a Member'."

Google's reviewers sign in from their own devices too, so the no-2-Step
rule above applies here as well.

Add to **Other information** on the Coach entry, since a reviewer will not
find it otherwise: "A booked session can be held on video inside the app.
Add a session starting within the next ten minutes from Schedule, then tap
Join. Calls are 1:1 and are never recorded." The Data safety form's answer
for call audio and video is `store/play-console.md` §7, question 13 —
settle that before this is submitted, not after.
