import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, type MessageKey } from '../lib/i18n';
import { ChevronIcon, CheckIcon } from '../components/icons';
import { useRemoteSession } from '../lib/remoteSession';
import { useMemberStore } from '../store/memberStore';
import { claimInvite, peekInvite, type InvitePreview } from '../lib/memberData';
import './ClaimInvite.css';

/**
 * Redeeming a coach's invite code (0013).
 *
 * The member cannot read `clients`, so they cannot see whose roster a code
 * belongs to. That is why this is two steps rather than one field and a
 * button: `peek` names the coach and the record, then the member confirms.
 * Confirming blind would mean linking your account to a stranger's row on
 * the strength of a string someone sent you.
 */

/** Every refusal 0013 returns, mapped to a line the member can act on. */
const ERROR_COPY: Record<string, MessageKey> = {
  not_found: 'claimInviteErrNotFound',
  expired: 'claimInviteErrExpired',
  already_used: 'claimInviteErrUsed',
  own_invite: 'claimInviteErrOwn',
  rate_limited: 'claimInviteErrLimited',
  not_a_member: 'claimInviteErrNotMember',
  not_signed_in: 'claimInviteErrNotMember',
};

/** Crockford base32, grouped as the coach sees it: XXXXX-XXXXX. */
function formatCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

type Stage = 'enter' | 'confirm' | 'joined';

export default function ClaimInvite() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const remote = useRemoteSession();
  const memberUserId = useMemberStore((s) => s.userId);
  const refreshSpace = useMemberStore((s) => s.refresh);
  const selectRelationship = useMemberStore((s) => s.select);

  const [stage, setStage] = useState<Stage>('enter');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [errorCoach, setErrorCoach] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);

  // Ten characters, plus the grouping dash the formatter inserts.
  const complete = code.replace(/-/g, '').length === 10;

  const refusalKey = (message: string): MessageKey => ERROR_COPY[message] ?? 'requestFailedRetry';

  async function check() {
    if (!complete || busy) return;
    setBusy(true);
    setErrorKey(null);
    setErrorCoach('');
    const result = await peekInvite(code);
    setBusy(false);
    if (!result.ok) {
      setErrorKey(result.code === 'refused' ? refusalKey(result.message) : 'requestFailedRetry');
      return;
    }
    // A real code for a row this member already holds: name the coach
    // rather than leaving them to guess which relationship it was.
    if (result.data.alreadyLinked) {
      setErrorCoach(result.data.coachName);
      setErrorKey('claimInviteErrLinked');
      return;
    }
    setPreview(result.data);
    setStage('confirm');
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setErrorKey(null);
    const result = await claimInvite(code);
    setBusy(false);
    if (!result.ok) {
      // A code can be spent between the peek and this call, so a refusal
      // here is ordinary rather than exceptional: back to the field with
      // the reason, not a dead end.
      setErrorKey(result.code === 'refused' ? refusalKey(result.message) : 'requestFailedRetry');
      setStage('enter');
      setPreview(null);
      return;
    }
    // The member has a relationship they did not have a moment ago. refresh
    // re-reads in the background rather than load's spinner, and selecting
    // it is what makes the app open on this coach rather than another.
    if (memberUserId) await refreshSpace(memberUserId);
    selectRelationship(result.data.clientId);
    setStage('joined');
  }

  if (stage === 'joined' && preview) {
    return (
      <div className="phone-frame claim-invite-screen">
        <div className="claim-invite-done">
          <span className="claim-invite-tick">
            <CheckIcon size={28} color="#FFFFFF" />
          </span>
          <h1 className="claim-invite-done-title">{t('claimInviteJoinedTitle')}</h1>
          <p className="claim-invite-done-body">
            {t('claimInviteJoinedBody', { coach: isolate(preview.coachName) })}
          </p>
          <button type="button" className="claim-invite-primary" onClick={() => nav('clientCoach')}>
            {t('claimInviteDone')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame claim-invite-screen">
      <div className="claim-invite-header">
        <button type="button" className="claim-invite-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="claim-invite-title">{t('claimInviteTitle')}</div>
      </div>

      <div className="claim-invite-body">
        {stage === 'confirm' && preview ? (
          <>
            <div className="claim-invite-coach">
              {preview.coachPhoto
                ? <img className="claim-invite-coach-photo" src={preview.coachPhoto} alt="" />
                : <div className="claim-invite-coach-avatar">{initialsOf(preview.coachName)}</div>}
              <div>
                <div className="claim-invite-coach-name"><bdi>{preview.coachName}</bdi></div>
                {preview.coachTitle && <div className="claim-invite-coach-title"><bdi>{preview.coachTitle}</bdi></div>}
              </div>
            </div>
            <h2 className="claim-invite-confirm-title">
              {t('claimInviteConfirmTitle', { coach: isolate(preview.coachName) })}
            </h2>
            <p className="claim-invite-confirm-body">
              {t('claimInviteConfirmBody', { name: isolate(preview.clientName) })}
            </p>
            <button type="button" className="claim-invite-primary" disabled={busy} onClick={() => void confirm()}>
              {busy ? t('claimInviteChecking') : t('claimInviteConfirm')}
            </button>
            <button
              type="button"
              className="claim-invite-secondary"
              disabled={busy}
              onClick={() => { setStage('enter'); setPreview(null); }}
            >
              {t('claimInviteBack')}
            </button>
          </>
        ) : (
          <>
            <p className="claim-invite-sub">{t('claimInviteSub')}</p>
            <label className="claim-invite-label" htmlFor="invite-code">{t('claimInviteLabel')}</label>
            {/* The code is Crockford base32 and always reads left to right,
                so the field stays LTR even in Arabic. */}
            <input
              id="invite-code"
              className="claim-invite-input"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder="XXXXX-XXXXX"
              value={code}
              onChange={(e) => { setCode(formatCode(e.target.value)); setErrorKey(null); }}
            />
            {errorKey && (
              <p className="claim-invite-error" role="alert">
                {t(errorKey, { coach: isolate(errorCoach) })}
              </p>
            )}
            <button
              type="button"
              className="claim-invite-primary"
              disabled={!complete || busy || !remote}
              onClick={() => void check()}
            >
              {busy ? t('claimInviteChecking') : t('claimInviteContinue')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
