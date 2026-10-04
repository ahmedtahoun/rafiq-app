import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Its own app, its own node_modules, its own dep cache — so running this
// next to the main app's dev server (5173) or the screenshot run (5174)
// cannot disturb either. See ../store/screenshots/README.md for what
// sharing a Vite dep cache costs.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, host: '127.0.0.1' },
});
