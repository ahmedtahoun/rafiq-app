# Releasing Rafiq Pro

How a build gets from `main` to TestFlight and Google Play. What has to
exist *before* the first upload (store records, the icon, the privacy forms)
is in `LAUNCH-CHECKLIST.md`; this file is the mechanics, in order.

## 1. Before every upload

```sh
git switch main && git pull
npm ci
npm run build && npm run lint && npm test     # all green, as in CI
npm run app-version -- 1.0.0 2                # new version, new build number
npm run build && npx cap sync                 # bakes .env.local, copies into both apps
```

- **The build number must go up on every upload**, including one the store
  rejected. `npm run app-version` refuses one that isn't higher, and keeps
  Android's `versionCode` and iOS's build number equal, so one number names
  one upload on both. Commit the bump in a PR like any other change.
- **`npm run build` bakes `.env.local` into the app.** Check it points at the
  live project (`muikkxccdamtejvheepx`), because that is what users get.
- A native build uses whatever `npx cap sync` last copied. Run it after the
  last web change, every time.

## 2. Android

### The upload key (once, ever)

Google Play signs what users install with its own key (Play App Signing).
What you upload is signed with your **upload key**. Lose it and you cannot
publish updates until Google resets it, which takes days. Leak it and
someone else can.

```sh
mkdir -p android/keystore
keytool -genkeypair -v -keystore android/keystore/rafiq-upload.jks \
  -alias rafiq-upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` asks for a password and a name; use a long generated password.
Then create `android/keystore/keystore.properties`:

```properties
storeFile=rafiq-upload.jks
storePassword=<the password>
keyAlias=rafiq-upload
keyPassword=<the password>
```

- `android/keystore/` is gitignored. Never commit it, never paste it into
  chat, email or an issue.
- **Back up both files and the password** somewhere that survives this Mac,
  such as a password manager entry with the `.jks` attached.
- A release build without these files stops with "No upload key" instead of
  producing an unsigned bundle.

### Build and upload

```sh
cd android
JAVA_HOME=<a JDK 21> ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` in Play Console → Testing → **Internal testing** first. On
the first upload, accept **Play App Signing**: Google keeps the app signing
key, and you keep the upload key above. Then closed testing: a personal
developer account needs 12 testers for 14 days before production (checklist
§5).

## 3. iOS

Signing is automatic, as team `55BRQ92599`. The first archive creates the
Apple Distribution certificate and the App Store profile, so the Apple ID
signed into Xcode (Settings → Accounts) must be an Admin on that team. The
App Store Connect record for `app.rafiqie.coach` must exist before the
upload (checklist §5).

**From Xcode** (simplest): open `ios/App/App.xcodeproj`, choose the scheme
**App** and the destination **Any iOS Device (arm64)**, then Product →
Archive. When the Organizer opens, choose Distribute App → App Store Connect
→ Upload.

**From the command line:**

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Rafiq.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/Rafiq.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -allowProvisioningUpdates
```

`ios/ExportOptions.plist` uploads straight to App Store Connect. The build
appears in TestFlight after Apple finishes processing it, usually within the
hour. Internal testers first, then external (external testing needs a short
Beta App Review).

## 4. After the upload

- Test the store build itself, not a local one: install from TestFlight or
  the Play internal track, and sign in on each.
- Tag the commit you built: `git tag v1.0.0-2 && git push origin v1.0.0-2`.
- Production releases go out phased (Apple: phased release; Play: staged
  rollout), so a bad build reaches a few percent first.
