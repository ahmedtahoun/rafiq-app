import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initCrashReporting } from './lib/crashReporting';
// Bundled, not fetched from Google Fonts: a fetch would hand every user's IP
// to Google on first launch, and without the network the Arabic side would
// fall back to a system font. Each file's unicode-range means only the
// scripts a screen actually uses are loaded.
import '@fontsource/lora/500.css';
import '@fontsource/lora/600.css';
import '@fontsource/lora/700.css';
import '@fontsource/cairo/500.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import './theme/tokens.css';
import './theme/glass.css';

// Returns immediately, and without loading the SDK at all, when
// VITE_SENTRY_DSN is unset. Not awaited: a crash reporter must never be on
// the path between launch and the first frame.
void initCrashReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
