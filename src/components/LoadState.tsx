import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { Button } from './Button';
import './LoadState.css';

type Props =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void; /** Offer a way off the screen, for ones that aren't a tab root. */ showBack?: boolean };

/**
 * The whole-screen state a screen shows while its data is on its way from
 * Supabase, or when it couldn't be fetched. Rendered in place of the
 * screen rather than over a half-empty one, so nothing flashes default
 * values before the real ones arrive (SUPABASE-MIGRATION-PLAN.md).
 */
export function LoadState(props: Props) {
  const t = useT();
  const back = useAppStore((s) => s.back);

  if (props.status === 'loading') {
    return (
      <div className="phone-frame load-state" role="status" aria-live="polite">
        <div className="load-state-spinner" aria-hidden="true" />
        <p className="load-state-body">{t('loadingEllipsis')}</p>
      </div>
    );
  }

  return (
    <div className="phone-frame load-state" role="alert">
      <div className="load-state-mark" aria-hidden="true">!</div>
      <h1 className="load-state-title">{t('loadFailedTitle')}</h1>
      <p className="load-state-body">{t('loadFailedBody')}</p>
      <Button onClick={props.onRetry}>{t('retry')}</Button>
      {props.showBack && (
        <button type="button" className="load-state-back" onClick={back}>
          {t('back')}
        </button>
      )}
    </div>
  );
}
