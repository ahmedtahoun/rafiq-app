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
- [ ] The redirect URL `app.rafiqie.coach://auth-callback` is in Supabase →
      Auth → URL Configuration (checklist §4), or native sign-in fails.
- [ ] The build under test is the store build (TestFlight or Play internal
      testing), not a local one (`RELEASE.md` §4).

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
   **Invite them** → copy the code. Keep the code for step 9.
5. Add a task to that member (**New Task**) and a session on the Schedule.
6. Close the app completely and reopen it: still signed in, everything
   still there.

### Member (review member account, on the other phone)

7. Fresh install → **Continue with Google** → **"I'm a Member"** →
   onboarding: pick a focus, and **the "Coaching is not therapy" notice
   and the crisis list open** from the foot of the form.
8. Home shows the no-coach state → **I have an invite code**.
9. Enter the code from step 4, typed in lower case with a space in it (it
   has to be accepted) → **Join {coach}?** → join.
10. The task and the session from step 5 are there, with the right day and
    time. Times in Cairo are the easy thing to get wrong: a 6 PM session
    must say 6 PM.
11. Tick the task → on the coach's phone the member's record shows it done.
12. Discover → the coach from step 2 is listed → their page → request a
    session at a free time → **Request sent!**
13. Coach: Notifications → **Accept**. Member: the session appears, and so
    does the notification.
14. **Message** the coach → it appears on the coach's phone without a
    refresh → reply → it appears on the member's.
15. Member: ask to move the session → coach accepts → both see the new time.
16. Coach: mark a past session attended. Member: **Rate Session** → the
    review shows on the coach's page signed with first name and last
    initial, never a full name.
17. Member: **Report a problem** on the coach → **Report submitted**. It
    appears in the open-reports query (`supabase/admin/README.md`).
18. Member: **Block** in the thread → neither side can send; unblock →
    both can.
19. Airplane mode on either phone → an error with a retry, never a blank
    screen or demo data → back online → retry works.
20. Android: the hardware back button walks back through screens and only
    leaves the app from a tab root.

### Deletion (on a third, throwaway account, not the review accounts)

21. Sign up a throwaway member, link it to the review coach, then
    **Delete Account** → confirm → the request shows in pending deletions →
    process it (`account-deletion` function) → the login is gone, and the
    coach's record keeps the sessions without the name.

Anything that fails blocks the submission. When it all passes, leave both
review accounts as they are: that is the data the reviewers will see.

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
> booking sends a request the coach accepts, and the coach subscription
> shows "Coming soon". There are no in-app purchases in this version.
>
> User-generated content (guideline 1.2): members can report a coach from
> the coach's page ("Report a problem"), and either side can block the
> other from the message thread ("Block"). Reports are reviewed by the
> Rafiq team.
>
> Account deletion (5.1.1(v)): Profile → Delete Account.
>
> Coaching is not therapy or medical advice. This is stated in the terms
> and during member onboarding, with crisis resources.
>
> There are no push notifications in this version. Notifications are shown
> inside the app.

⚠️ Two lines in those notes depend on decisions that are still open. Check
them before pasting:
- "No payment is taken": only true while the payments model (§3) is
  undecided. If Paymob for sessions or In-App Purchase ships first, rewrite
  that paragraph.
- "Reports are reviewed": the response time isn't stated yet (§9).

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
