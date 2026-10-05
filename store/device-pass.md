# The device pass — what can only fail on real hardware

`store/review-notes.md` §2 is the **functional** run-through: two
accounts, both roles, every feature, end to end. This is the **hardware**
pass, and it is a different list — the things that pass on a simulator
and fail on a phone.

**Do this one first.** If the keyboard covers the message composer, you
cannot finish step 14 of the functional run-through anyway, and you will
have spent an evening discovering it the slow way.

Checklist §4 is the source: both "first build on a real phone" rows,
native sign-in, the video call, and the keyboard / status bar / splash
row are all still unchecked, and CLAUDE.md records that **nobody has run
this app on a physical phone.** Everything to date is simulator and
emulator.

## What you need

- A **notched iPhone** (Dynamic Island if you have one) on the TestFlight
  build. The simulator hides the whole class of bug this catches.
- An **Android phone** on the Play internal-testing build. Ideally not a
  flagship — a cheap one surfaces cold-start and jank.
- A **SIM with data**, for the cellular steps. Wi-Fi only hides them.
- Both store builds, not local ones (`RELEASE.md` §4).

File what you find; don't fix it mid-pass. Nothing below is a change to
make in `src/` while you are holding a phone.

---

## 1. Cold start and the splash

Android's splash is configured as a modern Android 12+ one
(`Theme.SplashScreen`, `windowSplashScreenBackground`,
`windowSplashScreenAnimatedIcon` in `styles.xml`); iOS uses
`Splash.imageset`. Neither has been seen on hardware.

- [ ] Kill the app completely, then launch. **No white flash** between
      the splash and the first screen — that is the usual Capacitor tell.
- [ ] The splash icon is the real mark, not Capacitor's placeholder.
- [ ] Launch with the phone in **dark mode**. Android has a
      `drawable-night/splash.png`; check it is the one you get.
- [ ] Time it on the cheap Android. Over ~3 seconds to first paint is
      worth an issue.

## 2. Safe areas — top and bottom, every screen

The fix is in (`--safe-top` / `--safe-bottom` in `src/theme/tokens.css`,
guarded by `tests/safe-area.spec.js`), and the original bug — onboarding
**Skip** sitting under the status bar, where iOS swallows the tap — is
the reason this section exists. A test asserts the tokens are applied; it
cannot assert they are *enough* on a real notch.

- [ ] Every screen with a top-row button: the button is **tappable**, not
      merely visible. Tap it, don't look at it. Onboarding Skip and back
      first, since that is the one that failed.
- [ ] The bottom tab bars sit above the **home indicator**, and tapping
      the lowest row of tabs does not trigger the system gesture instead.
- [ ] Repeat on the Android phone, including one with a **gesture
      navigation bar** rather than three buttons.
- [ ] Any bottom sheet or modal (the delete sheet, the crisis list)
      clears both the notch and the indicator.

## 3. The keyboard — untested, and the likeliest failure

Checklist §4's keyboard row has never been ticked, and
`@capacitor/keyboard` is **not installed**, so whatever happens is the
web view's default. This is the single most common Capacitor bug.

For each of these, open the field, type, and check the field is still
visible and the send/save control is reachable:

- [ ] The **message composer** — long thread, keyboard up. Can you see
      what you are typing and reach Send?
- [ ] **Edit profile → bio**, a multi-line field.
- [ ] **New task** title, **New member** name, **Add offering** price.
- [ ] Sign-up name, on first run.
- [ ] With the keyboard up, does the **tab bar** ride up over the content
      or stay put? Either can be right; a tab bar floating mid-screen is
      not.
- [ ] Android with a **gesture bar + keyboard** together, which is the
      tightest case.

If it fails, the fix is `@capacitor/keyboard` plus `resize` configuration
— a real change, not a tweak, so file it rather than patching it at 1am.

## 4. Status bar in dark mode — my prediction is this fails

`Info.plist` sets `UIViewControllerBasedStatusBarAppearance = true`, and
**`@capacitor/status-bar` is not a dependency.** So the status bar text
colour is whatever the hosting view controller says, and nothing tells it
the web app just switched to dark. Dark background with dark status-bar
text means an invisible clock and battery.

- [ ] Light mode: status bar text readable on every screen.
- [ ] **Profile → Preferences → dark mode**, without relaunching: does
      the status bar follow?
- [ ] Set the **phone** to dark mode and relaunch — this may behave
      differently from the in-app toggle, and both matter.
- [ ] Same on Android.

If it is wrong, this is `@capacitor/status-bar` wired to the same place
the theme toggle lives. Worth an issue even if it is only cosmetic — it
is the first thing a reviewer sees.

## 5. Orientation — a gap I found while writing this

`ios/App/App/Info.plist` lists **`UIInterfaceOrientationLandscapeLeft`
and `LandscapeRight`** alongside portrait, and Android's `MainActivity`
has no `screenOrientation` at all. So **both apps rotate**, and the UI
is a single phone-width column that has almost certainly never been
looked at sideways.

`tokens.css` compounds it: it defines `--safe-top` and `--safe-bottom`
and **no left/right insets**. In landscape on a notched iPhone the notch
is on the side, which is exactly the case nothing accounts for.

- [ ] Rotate on every tab root, and during a video call.
- [ ] Rotate with the keyboard up.

If it looks broken — and I expect it does — the honest fix is to lock to
portrait (`UIInterfaceOrientationPortrait` only, and
`android:screenOrientation="portrait"`) rather than to design a landscape
layout for v1. Reviewers do rotate. Note that locking portrait is a
native-project change, so it needs a build to verify.

## 6. Native sign-in, end to end — never once completed

CLAUDE.md is explicit: the in-app browser opens Google's and Apple's
pages, and **nobody has ever signed in through them**. This needs
`app.rafiqie.coach://auth-callback` in Supabase → Auth → URL
Configuration (runbook §2) before it can work at all.

- [ ] **Google**, on both platforms, all the way back into the app.
- [ ] **Apple**, on both platforms.
- [ ] Apple with **"Hide My Email"** — and then check the relay address
      actually receives, which needs the Apple private relay registration
      (runbook §3).
- [ ] **Cancel** the sheet halfway. The app returns to the sign-in screen,
      not a blank one and not a spinner forever.
- [ ] **Background the app** while the browser is open, then come back.
- [ ] Sign out, sign in again as the **other role**, and confirm you get
      that role's app.

## 7. The video call on real hardware

Simulators fake cameras. None of this has been seen for real.

- [ ] **Permission prompts** for camera and microphone appear with the
      strings from `Info.plist`, in the app's language.
- [ ] **Deny the microphone**, then start a call. An honest error, not a
      black screen or a crash.
- [ ] Both sides see and hear each other, on two real phones.
- [ ] **Speaker vs earpiece** — audio should come out of the speaker for
      a video call, not the earpiece.
- [ ] **Cellular, not Wi-Fi**, both ends if you can.
- [ ] **Lock the screen** mid-call. There is no `UIBackgroundModes` in
      `Info.plist`, so iOS will suspend the app — find out what the other
      side sees. Decide afterwards whether the `audio` background mode is
      wanted; adding it means answering Apple's question about why.
- [ ] Take an **incoming phone call** mid-session.
- [ ] Ten minutes of call: check **heat and battery**. A phone that gets
      hot in ten minutes is a finding.

## 8. Permission denial paths

§2 of the run-through checks the prompts appear; it does not check what
happens when someone says no.

- [ ] **Photos denied** → Edit profile → choose a photo. A clear message,
      and a route to Settings.
- [ ] **Camera denied** → same.
- [ ] Grant later in Settings, come back: does the app notice?
- [ ] Android 13+ asks for **notifications** separately — the app's
      notification toggles must stay honest if it is denied.

## 9. Accessibility text and display zoom

Checklist §4 ticks "large system text sizes" on the reasoning that every
size is in px. That reasoning is right for Android's font scale and
incomplete for iOS Display Zoom, which changes the logical width.

- [ ] iOS: **largest accessibility text size**. Nothing truncates to
      nonsense, no button loses its label.
- [ ] iOS: **Display Zoom → Larger Text** in Settings → Display.
- [ ] Android: font size *and* **display size** at maximum.
- [ ] Both: the tab bars, which are five items and the first thing to
      break.

## 10. Arabic on real hardware

The suite runs RTL in a desktop browser. Phones add gestures.

- [ ] iOS **swipe-back gesture in Arabic**: it should start from the
      *right* edge in RTL. Getting this backwards is a classic.
- [ ] Android **hardware/gesture back** in Arabic walks back correctly
      and only exits from a tab root.
- [ ] Arabic + dark mode + largest text, one screen at a time, looking
      for clipping.
- [ ] A **time range** on a real phone in Arabic — `10:00 AM – 10:45 AM`
      is the string that scrambled before.
- [ ] Set the **phone's** language to Arabic and the app's to English,
      and vice versa. They are independent and should stay that way.

## 11. Handoffs out of the app

- [ ] **Contact Us** opens Mail with `support@rafiqpro.com` filled in.
      Needs the mailbox to exist (runbook §2).
- [ ] **Rate Rafiq** opens the store. On iOS it is **hidden until
      `APP_STORE_ID` is set** in `src/lib/support.ts` — if you see it
      before that, something is wrong; if you don't, that is correct.
- [ ] Tapping a **notification** opens the right screen, not just the app.
- [ ] A link to `https://rafiqpro.com/privacy/` from inside the app opens
      the real page (runbook §1).

## 12. The unglamorous ones

- [ ] **Airplane mode** mid-action, not just at launch — send a message
      with the radio off.
- [ ] Leave the app **backgrounded overnight**, come back: still signed
      in, no stale data, no crash.
- [ ] **Low battery / power saving mode** on Android — does anything stop?
- [ ] Install over a **previous build** rather than fresh, once you have
      two builds. Stored data from the older one must not crash the newer
      (`readLocal` does not validate shape — CLAUDE.md).

---

## Where I expect this to find things

In order, from my reading of the native projects — all predictions, none
verified:

1. **Status bar in dark mode** (§4). No plugin, no wiring. I would be
   surprised if this is right.
2. **Landscape** (§5). Allowed by both manifests, designed for by
   neither.
3. **The keyboard** (§3). No plugin; the default is often wrong on
   Android with a gesture bar.
4. **Screen lock during a call** (§7). No background mode.

Everything else I would expect to pass, and the safe-area work in
particular looks genuinely done rather than assumed.

## What to do with what you find

Each failure gets an issue, not a fix in the moment. Most of these land
in `src/screens/` or the native projects, which is Reem's and Ahmed's
ground. Say which phone, which OS version, which language and which
build number — a safe-area bug that only shows on one notch shape is
otherwise unreproducible.

Then tick checklist §4's two "real phone" rows, the sign-in row, the
video-session row, and the keyboard / status bar / splash row — those
five are what this pass exists to close.
