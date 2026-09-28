# Launch checklist — App Store & Google Play

Everything between today and a published Rafiq, checked against the repo on
2026-09-27. Tick items off in the PR that does them (`- [x]`), so this file
stays the source of truth the same way `WORK-SPLIT.md` is.

**Tags:** 🔴 **blocker** — the stores reject the app, or it doesn't work for a
real user · 🟡 **required before public launch** · ⚪ recommended.
**Owner:** *Ahmed* = a decision or an account only you hold · *Dev* = code in
this repo · *Design* = assets.

**The long poles** — start these first, they gate everything else or take
calendar time no matter how fast the code moves:
1. Connecting the app to the live database (§2) — the biggest piece of work.
2. The name decision (§1) — icon, screenshots and store listing all wait on it.
3. Google Play closed testing — **12 testers for 14 days** on a new personal
   developer account (§6). Start it the moment a working Android build exists.
4. The payments model (§3) — Apple's rules shape what can even be built.

---

## 1. Decisions (Ahmed)

- [x] 🔴 **Name: Rafiq or Rafiqie.** Decided: **Rafiq Pro** in English,
      **رفيق** in Arabic; the coach subscription is **Rafiq Pro Plus**
      (رفيق برو بلس). Bundle IDs stay `app.rafiqie.coach` — never shown to
      users, and changing them would mean new store listings.
- [ ] 🔴 **One domain for the brand.** Decided: **rafiqpro.com** (matches
      the name and `support@rafiqpro.com`). **Not registered yet — buy it
      first:** the app already sends users to `support@rafiqpro.com`, which
      bounces until the domain and a mailbox exist. Then it hosts the privacy
      policy, terms, support page and account-deletion page (§8), and goes
      on Google's OAuth consent screen as an authorized domain (§5). The app
      IDs saying `rafiqie` don't matter: they are never shown.
- [ ] 🔴 **Payments model** — see §3 before deciding. Includes whether Rafiq
      takes a commission on sessions and how coaches get paid out.
- [ ] 🟡 **Company / legal entity** that owns the developer accounts, receives
      store payouts and signs the App Store Paid Apps agreement.
- [ ] 🟡 **Launch coaches.** Discover must not open empty or with fake coaches
      (see §2). Recruit a first set of real coaches who finish signup before
      public launch.

## 2. Connect the app to the database (Dev)

The live Supabase project has the full schema (migrations `0001`–`0005`,
locked down, 144 tests in CI). **The app doesn't use it yet** — apart from
reading and setting the user's role at sign-in, every screen reads and writes
`src/lib/mockStore.ts` / `src/lib/directory.ts` (localStorage on the phone).

- [ ] 🔴 Replace each `mockStore` / `directory` function body with a Supabase
      query against the matching table — the tables mirror `mockStore`'s
      types, and `supabase/README.md` covers where the model differs.
      Suggested order: reports, verification and deletion requests (the admin
      queues need them) → profile and onboarding → clients, tasks and
      sessions → scheduling → messaging → the rest.
- [ ] 🔴 **Remove the demo identities.** 14 member screens hardcode
      `const CLIENT_ID = 'sara'`, and the Pro side is the seeded
      `DEFAULT_PRO_ID = 'pro-yasmin'`. Both must come from the signed-in user.
- [ ] 🔴 **Remove the demo data:** `DEFAULT_CLIENTS`, `DEFAULT_TASKS`,
      `DEFAULT_ENROLLMENTS`, `DEFAULT_TEMPLATES`, `FALLBACK_MEMBER_SESSIONS`,
      the 8 fictional `DIRECTORY_COACHES`, and any other `DEFAULT_*` seed.
      Apple rejects placeholder content, and fake coaches in a marketplace
      mislead users.
- [ ] 🔴 **Use the real clock.** Calendar maths runs on a fixed fictional week
      (`TODAY_MS = Date.UTC(2025, 9, 22)`; screens hardcode `TODAY_INDEX = 2`).
      Real users would see October 2025. Replace with the current time, and
      re-check `format.ts`'s UTC wall-clock rule (CLAUDE.md, "Display every
      date and time") once times come from real bookings.
- [ ] 🔴 Loading, empty and error states on every screen. Today every read is
      synchronous localStorage; network reads can be slow or fail.
- [ ] 🟡 Discover and coach profiles read the `coach_directory` and
      `coach_reviews` views. The views sign reviews with a **first name and
      last initial**; the app currently shows the reviewer's full name
      publicly — that must go.
- [ ] 🟡 Messaging updates live (Supabase Realtime on `messages`).
- [x] 🟡 Profile and cover photo upload through `src/lib/storage.ts` to the
      private `avatars` / `covers` buckets.
- [ ] 🟡 Run `npx supabase gen types typescript --linked > src/lib/database.types.ts`
      after every migration (`supabase/README.md`).

## 3. Payments

Apple's App Review Guidelines decide what may be paid outside the App Store:

- **Rafiq Pro** (the coach subscription) is a digital subscription →
  **must** use Apple In-App Purchase on iOS (guideline 3.1.1) and Google Play
  Billing on Android.
- **1:1 live coaching sessions** are person-to-person services → may use
  Paymob or another payment method (guideline 3.1.3(d)).
- **Group sessions, workshops and events** (one-to-few, one-to-many live) →
  guideline 3.1.3(d) says these **must use In-App Purchase** on iOS.

- [ ] 🔴 *Ahmed:* confirm the model above against the current guidelines, and
      Google Play's Payments policy for the Android side.
- [ ] 🔴 *Dev:* Rafiq Pro through In-App Purchase + Play Billing (RevenueCat
      handles both stores and receipt validation). Tier changes arrive from its
      webhook as `service_role` — the app has no write access to
      `subscriptions`, by design.
- [ ] 🔴 *Dev:* Paymob for 1:1 sessions, server-side. The payment result is
      written to `payments` by a webhook / edge function as `service_role`.
      No Paymob secret key in the app, ever.
- [ ] 🔴 *Dev:* remove or replace every "demo" payment button (ClientBooking
      "Pay with card", Subscription upgrade, ClientCoach upgrade).
- [ ] 🟡 *Ahmed:* coach payouts and Rafiq's commission, if any.
- [x] 🟡 *Dev:* payouts backend — Paymob Payouts client, admin-only
      `payouts` Edge Function, `coach_payout_accounts` / `payouts` /
      `admin_users` tables (`0007`). See `supabase/functions/payouts/README.md`.
- [ ] 🟡 *Ahmed:* push `0007`, set the Paymob secrets, deploy the function, add
      yourself to `admin_users`, and run a staging payout (README, "Testing on
      staging").
- [ ] 🟡 *Dev:* the coach's payout-account screen and payout history (Earnings),
      and an admin screen to create, send and sync payouts (§9).
- [ ] 🔴 *Ahmed:* production Paymob Payouts credentials — new ones, never the
      staging set, and shared through a password manager, not email.

## 4. Native builds and device testing (Dev)

Nothing native has ever run on a device or simulator (CLAUDE.md, "Not verified").

- [ ] 🔴 First iOS build in Xcode, on the simulator and a real iPhone.
- [ ] 🔴 First Android build, on an emulator and a real phone.
- [ ] 🔴 Google and Apple sign-in end to end on both platforms. Confirm
      `app.rafiqie.coach://auth-callback` is in Supabase → Auth → URL
      Configuration → Redirect URLs (listed as a to-do in `WORK-SPLIT.md`).
- [x] 🔴 **Android hardware back button.** Nothing listens for it, so it exits
      the app from any screen. Wire `App.addListener('backButton', …)` from
      `@capacitor/app` to `appStore.back()`, exiting only on a tab root.
- [ ] 🟡 Safe areas and notch, keyboard covering inputs, status bar in dark
      mode, splash screen.
- [ ] 🟡 Large system text sizes. Every font size is in px, and Android scales
      WebView text with the system setting — check layouts at the largest size.
- [ ] 🟡 Photo picker from Edit Profile, including the camera option (§6).
- [ ] 🟡 `mailto:` (Contact Us) and store links (Rate Rafiq) hand off to the
      Mail app and store.

## 5. Accounts and console setup (Ahmed)

- [ ] 🔴 **Supabase:** upgrade to a paid plan before launch — free projects
      pause after a week without activity and have no point-in-time backups.
      Turn backups on and set the Site URL.
- [ ] 🔴 **Google Cloud OAuth consent screen:** move from "Testing" to
      **"In production"** (Testing limits sign-in to listed test users and
      expires their sessions after 7 days). Add app name, logo, privacy policy
      URL and the authorized domain; complete brand verification if asked.
- [ ] 🟡 **Apple sign-in secret expires ~6 months after it was made** (made
      around 2026-09-22). Put a reminder in early March 2027 to regenerate it:
      `node scripts/generate-apple-oauth-secret.mjs <path-to-.p8>`, then paste
      the result into Supabase → Auth → Providers → Apple.
- [ ] 🟡 **App Store Connect:** create the app record for `app.rafiqie.coach`;
      sign the Paid Apps agreement and fill in tax and banking (needed for
      In-App Purchase). Then put the app's Apple ID into `APP_STORE_ID` in
      `src/lib/support.ts` — until then, "Rate Rafiq" is hidden on iOS.
- [ ] 🟡 **Google Play Console:** payments profile (for Play Billing); decide
      personal vs organization account (organizations skip the
      12-testers / 14-days rule).
- [ ] 🟡 **Support mailbox** `support@rafiqpro.com` exists and someone reads
      it — the app, both privacy policies and the store listings point there.

## 6. Store requirements the code must meet (Dev)

### iOS
- [x] 🔴 Add `ios/App/App/PrivacyInfo.xcprivacy` — Apple requires a privacy
      manifest, and there isn't one (Capacitor's docs list the entries).
- [x] 🔴 Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`
      to `Info.plist`, in English and Arabic (`InfoPlist.strings`). Edit
      Profile uploads a photo; choosing the camera without these crashes the app.
- [x] 🟡 `ITSAppUsesNonExemptEncryption = NO` in `Info.plist` (HTTPS only),
      so each build skips the export-compliance question.
- [ ] ⚪ Native Sign in with Apple (capability + entitlement). The current web
      flow in an in-app browser meets guideline 4.8; native is a smoother sign-in.

### Android
- [ ] 🔴 Create the upload keystore, **back it up somewhere safe**, never
      commit it (`android/keystore/` is gitignored), and enroll in Play App
      Signing.
- [ ] 🔴 Web page where users can request account deletion — Google Play
      requires a URL, not only the in-app button. **Page ready**
      (`site/public/delete-account/`, EN + AR); goes live with the site at
      `https://rafiqpro.com/delete-account/` once the domain is bought.
- [ ] 🟡 `versionCode` / `versionName` (`android/app/build.gradle`) and
      `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (Xcode) raised on every
      upload.
- [x] targetSdk 36 (`android/variables.gradle`).

### Both
- [ ] 🔴 **Push notifications, or honest toggles.** Profile screens offer
      "Session reminders", "Task reminders" and "Payment reminders", but the
      app has no push notifications (no `@capacitor/push-notifications`, no
      APNs/FCM). Either build them (plugin + APNs key + Firebase project +
      send from database triggers) or relabel the toggles as in-app only.
- [ ] 🔴 **Account deletion must actually happen.** The app files a request
      into `account_deletion_requests`; someone has to process it (§9), within
      a stated time.

## 7. Branding and store listing (Design + Ahmed)

Waits on the name decision (§1).

- [x] 🔴 Rename the display name everywhere: `capacitor.config.ts` `appName`,
      `CFBundleDisplayName` in `ios/App/App/Info.plist`, `app_name` in
      `android/app/src/main/res/values/strings.xml`, ~40 "Rafiq"/"رفيق"
      strings in `src/lib/i18n.ts`, `index.html` `<title>`, `package.json`,
      README. Done, including the camera/photo permission text
      (`NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` in
      `Info.plist` and `en.lproj`/`ar.lproj` `InfoPlist.strings`) and the
      Arabic home-screen names (`ar.lproj/InfoPlist.strings`,
      `values-ar/strings.xml`). `package.json`'s `name` stays `rafiq-app`:
      it is an internal id, never shown.
- [ ] 🔴 **App icon** — both platforms still ship Capacitor's placeholder.
      iOS 1024×1024 into `ios/App/App/Assets.xcassets/AppIcon.appiconset/`;
      Android adaptive icon (foreground + background) into
      `android/app/src/main/res/mipmap-*/`.
- [ ] 🟡 Logo inside the app — Welcome, RoleSelect and Auth show a CSS "R"
      placeholder; plus a splash screen.
- [ ] 🔴 **Screenshots, in English and Arabic:** iPhone 6.9" (1320×2868),
      3–10 per language; Google Play: at least 2 phone screenshots, a 1024×500
      feature graphic and a 512×512 icon. Take them from the connected app, not
      the demo data.
- [ ] 🔴 Store text in English and Arabic: name (iOS: 30 characters),
      subtitle, description, keywords, category, "what's new".
- [ ] 🔴 Public URLs: privacy policy, terms, support. **Pages ready** in
      `site/public/`, EN + AR, generated from the app's own copy
      (`npm run build:site`, see `site/README.md` for hosting and which URL
      goes in which console). Waiting on registering rafiqpro.com.

## 8. Legal and policy (Ahmed)

- [ ] 🔴 Privacy policy and terms reviewed by a lawyer and hosted publicly.
      Cover Egypt's data protection law (Law 151/2020), and GDPR if you accept
      EU users. Mood check-ins and coaching topics (breakups, stress) are
      sensitive — say how they're protected. Hosting is ready (`site/`);
      the text it publishes is the app's current copy, not yet reviewed.
- [ ] 🔴 **App Privacy (Apple) and Data safety (Google) forms** — list what's
      collected: name, email, phone, photos, messages, mood check-ins, ratings,
      payment status, plus crash data once §10 lands. For coaches who set up
      payouts: **national ID and wallet number or bank account** — financial
      info, and it must be in the privacy policy too.
- [ ] 🔴 Apple requires apps where users message each other to have reporting
      (✓ exists), blocking (✓ exists) and **timely action on reports** (§9),
      and terms users accept that forbid objectionable content.
- [ ] 🟡 Age rating (Apple) and content rating questionnaire (Google); target
      audience adults, not children.
- [ ] 🟡 "Coaching is not therapy or medical advice" in the terms and onboarding,
      with crisis resources for the wellness categories.
- [ ] 🟡 Coaching Service Agreement text (`AGREEMENT_TEXT` in `mockStore.ts`)
      reviewed.

## 9. Admin panel (Dev)

Reports, verification requests, deletion requests and suspensions are queues
only Rafiq can resolve (as `service_role`). Nothing works them yet.

- [ ] 🔴 For closed testing: Supabase dashboard table editor + saved queries
      ("open reports", "pending verifications", "pending deletions") is enough.
- [ ] 🟡 Before public launch: a small admin web app (verification review,
      reports with suspend/block, deletion requests, user lookup), behind an
      admin role. The `service_role` key stays server-side, never in a browser.
- [ ] 🟡 A written response time for reports and deletions — and meet it.

## 10. Monitoring and performance (Dev)

- [ ] 🟡 Crash reporting (e.g. Sentry: `@sentry/capacitor`), reported from
      `src/components/ErrorBoundary.tsx`. Needs an account (*Ahmed*); add it to
      the privacy forms (§8).
- [ ] ⚪ Split the ~960 KB JavaScript bundle by screen for a faster start.
- [ ] ⚪ Analytics, if wanted — disclosed in the privacy forms.

## 11. Before each submission (Dev)

- [ ] `npm run build`, `npm run lint`, `npm test` and the schema suite green in CI.
- [ ] Full pass on real devices: English and Arabic, light and dark, a small
      iPhone and a large Android, slow network, offline.
- [ ] Both roles end to end with two real accounts: coach signs up → adds a
      member → member signs in and links → books → messages → pays → rates →
      reports → deletes account.
- [ ] **App Review notes:** test Google accounts for a coach and a member with
      data in them, and how to reach each role. With sign-in only through
      Google and Apple, reviewers can't get in otherwise.
- [ ] TestFlight (internal, then external) and Google Play closed testing
      before production; phased release.

---

## Already done — don't redo

- Google + Apple OAuth configured and working in the web app.
- Supabase schema live (`0001`–`0005`), locked down (signed-out access refused
  at the grant; six security holes closed), 144 schema tests in CI; generated
  types in `src/lib/database.types.ts`.
- Browser test suite (~180 tests) in CI: Arabic ordering, dark-mode
  contrast, timezone (tests run in Cairo time), money formatting, support rows.
- Contact Us opens `support@rafiqpro.com`; Rate Rafiq opens the store; privacy
  policies give the support address.
- iOS target is iPhone-only (no iPad screenshots or iPad review needed).
- Bundle IDs `app.rafiqie.coach` (+ `app.rafiqie.coach.web` for Apple sign-in).
- In-app account-deletion request, reporting, and blocking a Pro exist in the UI.
