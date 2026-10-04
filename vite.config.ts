import react from '@vitejs/plugin-react'
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
})
