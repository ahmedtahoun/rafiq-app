import { useId, useState } from 'react';
import { isolate, useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { fetchAgreement, sendAgreement } from '../lib/agreementData';
import { useRemoteLoad } from '../store/remoteLoad';

/**
 * The coaching agreement on the member's Profile: its title and status,
 * and, opened, the text with an explicit agreement step. Signing is never a
 * single tap: an unticked checkbox ("I have read this agreement and I agree
 * to it"), then the button, which stays disabled until the box is ticked.
 *
 * The same card serves the signed-out demo (mockStore) and a signed-in
 * member (agreementData.ts, issue #143): `onSign` is what differs, and it
 * says whether the signature was saved.
 */
export function AgreementCard({ titleKey, bodyKey, signedAtMs, onSign }: {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** null while it waits for the member's signature. */
  signedAtMs: number | null;
  onSign: () => Promise<boolean>;
}) {
  const t = useT();
  const fmt = useFormat();
  const checkboxId = useId();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signed = signedAtMs !== null;
  const color = signed ? 'var(--green)' : 'var(--ink-soft)';
  const bg = signed ? 'var(--green-bg)' : 'var(--accent-soft)';

  async function sign() {
    if (!agreed || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onSign();
    setBusy(false);
    if (!ok) setFailed(true);
  }

  return (
    <div className="client-profile-agreement-card">
      <button type="button" className="client-profile-agreement-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <div className="client-profile-agreement-icon" style={{ background: bg }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 15l2 2 4-4" />
          </svg>
        </div>
        <div className="client-profile-card-text">
          <div className="client-profile-card-title">{t(titleKey)}</div>
          <div className="client-profile-agreement-status" style={{ color }}>
            {signed ? t('agreementSignedOn', { date: fmt.instantDate(signedAtMs) }) : t('clientProfileAgreementAwaiting')}
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-soft)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transform: `rotate(${open ? '180deg' : '0deg'})`, transition: 'transform .15s', flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="client-profile-agreement-expand">
          <div className="client-profile-agreement-body">{t(bodyKey)}</div>
          {!signed && (
            <>
              <label className="client-profile-agreement-confirm" htmlFor={checkboxId}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={agreed}
                  disabled={busy}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>{t('agreementConfirm')}</span>
              </label>
              <button type="button" className="client-profile-agreement-sign" disabled={!agreed || busy} onClick={() => void sign()}>
                {t('agreementSign')}
              </button>
              {failed && <div className="client-profile-agreement-error" role="alert">{t('agreementSignFailed')}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The coach's view of the agreement with one member, on that member's page:
 * not sent (with Send), sent and waiting, or signed, when, and in which
 * language. Only for a member with an account: a walk-in has nobody to
 * sign (0028 refuses it too).
 */
export function AgreementStatusCard({ clientId, memberName }: { clientId: string; memberName: string }) {
  const t = useT();
  const fmt = useFormat();
  const load = useRemoteLoad(`agreement:${clientId}`, true, () => fetchAgreement(clientId));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (load.status === 'loading') return null;
  if (load.status === 'error') {
    return (
      <div className="client-detail-card client-detail-agreement" role="alert">
        <div className="client-detail-agreement-title">{t('clientDetailAgreementTitle')}</div>
        <div className="client-detail-agreement-line">{t('clientDetailAgreementLoadFailed')}</div>
        <button type="button" className="client-detail-agreement-action" onClick={load.retry}>{t('retry')}</button>
      </div>
    );
  }
  const ready = load;
  const agreement = load.data;

  async function send() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await sendAgreement(clientId);
    setBusy(false);
    if (result.ok) ready.set(result.data);
    else setFailed(true);
  }

  const line = agreement.status === 'none'
    ? t('clientDetailAgreementNone', { name: isolate(memberName) })
    : agreement.status === 'sent'
      ? t('clientDetailAgreementSent', { date: fmt.instantDate(agreement.sentAtMs) })
      : t(agreement.lang === 'ar' ? 'clientDetailAgreementSignedAr' : agreement.lang === 'en' ? 'clientDetailAgreementSignedEn' : 'agreementSignedOn', { date: fmt.instantDate(agreement.signedAtMs) });

  return (
    <div className="client-detail-card client-detail-agreement" data-status={agreement.status}>
      <div className="client-detail-agreement-title">{t('clientDetailAgreementTitle')}</div>
      <div className={`client-detail-agreement-line${agreement.status === 'signed' ? ' is-signed' : ''}`}>{line}</div>
      {agreement.status === 'none' && (
        <button type="button" className="client-detail-agreement-action" disabled={busy} onClick={() => void send()}>
          {t('clientDetailAgreementSend')}
        </button>
      )}
      {failed && <div className="client-detail-agreement-error" role="alert">{t('requestFailedRetry')}</div>}
    </div>
  );
}
