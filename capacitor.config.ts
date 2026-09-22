import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Note for anyone looking here for the OAuth URL scheme: it is not a
 * Capacitor config option. Custom URL schemes live in the native
 * projects — `ios/App/App/Info.plist` (CFBundleURLTypes) and
 * `android/app/src/main/AndroidManifest.xml` (an intent-filter on
 * MainActivity). `src/lib/nativeAuth.ts` holds the matching constants and
 * explains why there are two of them.
 *
 * `appId` below is the bundle id, which is a different thing, and is
 * mid-rename to app.rafiqie.coach — see WORK-SPLIT.md, "App rename
 * pending". Changing it also moves the Android package directory
 * (android/app/src/main/java/app/rafiq/coach/), so it is its own change.
 */
const config: CapacitorConfig = {
  appId: 'app.rafiq.coach',
  appName: 'Rafiq',
  webDir: 'dist'
};

export default config;
