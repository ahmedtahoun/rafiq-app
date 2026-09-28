import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Note for anyone looking here for the OAuth URL scheme: it is not a
 * Capacitor config option. Custom URL schemes live in the native
 * projects — `ios/App/App/Info.plist` (CFBundleURLTypes) and
 * `android/app/src/main/AndroidManifest.xml` (an intent-filter on
 * MainActivity). `src/lib/nativeAuth.ts` holds the matching constants and
 * explains why there are two of them.
 *
 * `appId` below is the bundle id, which is a different thing. It is
 * app.rafiqie.coach, matching what is registered in Apple Developer.
 * `appName` is the brand, Rafiq Pro. The bundle id kept its earlier
 * `rafiqie` spelling: it is never shown to anyone, and changing it would
 * mean a new App Store / Play listing.
 */
const config: CapacitorConfig = {
  appId: 'app.rafiqie.coach',
  appName: 'Rafiq Pro',
  webDir: 'dist'
};

export default config;
