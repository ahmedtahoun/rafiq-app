import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { exportBlobUrl, exportFilename, fetchMemberExport } from '../lib/memberExport';

/**
 * Profile → Privacy → "Download my data", for a signed-in member: one JSON
 * file of everything about them they can read in Rafiq (memberExport.ts).
 *
 * Nothing is read until they ask. Then the file is saved at once, and a
 * "Save the file" link stays for a second try. A read that fails says so;
 * it never hands over a partial file.
 *
 * On a phone the download goes through the web view, which may open the
 * file rather than save it: the same caveat as the Earnings CSV (#162).
 */
export function DownloadMyData() {
  const t = useT();
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'failed' } | { status: 'ready'; href: string; filename: string }>({ status: 'idle' });
  const link = useRef<HTMLAnchorElement>(null);

  // Saved once, the moment it's ready; the object URL goes with the screen.
  const href = state.status === 'ready' ? state.href : null;
  useEffect(() => {
    if (!href) return;
    link.current?.click();
    return () => URL.revokeObjectURL(href);
  }, [href]);

  async function prepare() {
    if (state.status === 'busy') return;
    setState({ status: 'busy' });
    const nowMs = Date.now();
    const result = await fetchMemberExport(new Date(nowMs).toISOString());
    if (!result.ok) {
      setState({ status: 'failed' });
      return;
    }
    setState({ status: 'ready', href: exportBlobUrl(result.data), filename: exportFilename(nowMs) });
  }

  return (
    <div className="client-profile-section client-profile-privacy">
      <div className="client-profile-section-label">{t('profilePrivacySection')}</div>
      <button type="button" className="client-profile-help" disabled={state.status === 'busy'} onClick={() => void prepare()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        <div className="client-profile-help-label">
          {state.status === 'busy' ? t('profileDownloadDataBusy') : t('profileDownloadData')}
          <div className="client-profile-help-sub">{t('profileDownloadDataSub')}</div>
        </div>
      </button>
      {state.status === 'ready' && (
        <a ref={link} className="client-profile-download-link" href={state.href} download={state.filename}>
          {t('profileDownloadDataSave')} <bdi dir="ltr">{state.filename}</bdi>
        </a>
      )}
      {state.status === 'failed' && <div className="client-profile-download-error" role="alert">{t('profileDownloadDataFailed')}</div>}
    </div>
  );
}
