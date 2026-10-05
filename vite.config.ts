import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Two Vite servers sharing one dep cache corrupt each other's, and the
  // symptom is not a clear error: unrelated screens render blank and the
  // suite reports a wide blast radius (CLAUDE.md, "A blank screen is
  // almost never your code"). `npm run screenshots` runs a second server
  // on 5174, so it sets this to a directory of its own. Unset — `npm run
  // dev`, `npm test`, CI — this is Vite's own default, unchanged.
  cacheDir: process.env.RAFIQ_VITE_CACHE_DIR || 'node_modules/.vite',
  // Phone notifications on Android need Firebase, which is configured by
  // android/app/google-services.json (Ahmed's, never committed). Without it
  // the plugin's register() throws inside the native bridge and the app
  // crashes, so src/lib/push.ts treats Android as having no push at all
  // unless the file was there when these web assets were built.
  define: {
    'import.meta.env.VITE_ANDROID_PUSH': JSON.stringify(
      existsSync(new URL('./android/app/google-services.json', import.meta.url)),
    ),
  },
})
