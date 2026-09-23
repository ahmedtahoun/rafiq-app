import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { translate, isRtl, type Lang } from '../lib/i18n';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time throw anywhere below it so one broken screen does
 * not white-screen the whole app.
 *
 * This matters more here than on the web: inside the Capacitor shell there
 * is no address bar to reload from, so an uncaught error leaves a member
 * staring at a blank view with no way out. The fallback gives them one.
 *
 * Everything it touches is wrapped, because the thing that threw may be
 * the store or the dictionary itself — a fallback that throws while
 * rendering the fallback is worse than no fallback at all.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack in the console: it is the only place the
    // failing screen is named once the tree has been replaced.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // The store is a plausible culprit, so read it defensively and fall
    // back to English rather than letting the fallback blow up too.
    let lang: Lang = 'en';
    try {
      lang = useAppStore.getState().lang;
    } catch {
      lang = 'en';
    }

    const say = (key: 'errorBoundaryTitle' | 'errorBoundaryBody' | 'errorBoundaryReload', fallback: string) => {
      try {
        return translate(lang, key);
      } catch {
        return fallback;
      }
    };

    return (
      <div className="phone-frame error-boundary" dir={isRtl(lang) ? 'rtl' : 'ltr'} role="alert">
        <div className="error-boundary-mark" aria-hidden="true">!</div>
        <h1 className="error-boundary-title">{say('errorBoundaryTitle', 'Something went wrong')}</h1>
        <p className="error-boundary-body">
          {say('errorBoundaryBody', 'The app hit an unexpected error. Reloading usually clears it — your saved data is not affected.')}
        </p>
        {/* The message is the app's own text, not the user's language, so
            it stays LTR and isolated even on an Arabic screen. */}
        {error.message && (
          <p className="error-boundary-detail"><bdi dir="ltr">{error.message}</bdi></p>
        )}
        <button
          type="button"
          className="error-boundary-action"
          onClick={() => { window.location.reload(); }}
        >
          {say('errorBoundaryReload', 'Reload')}
        </button>
      </div>
    );
  }
}
