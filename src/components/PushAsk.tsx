import { useState } from 'react';
import { useT } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import { declinePushOffer, syncPushDevice, type PushPermission } from '../lib/push';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import './PushAsk.css';

/**
 * The app's own "get notifications on your phone?" — what comes before the
 * phone's permission prompt, never instead of an explanation. Offered once
 * per phone, at a moment where a banner would obviously help: a member
 * just sent their first request, or a coach opened Notifications. "Turn on"
 * is what shows the phone's prompt; "Not now" is remembered, and Profile's
 * "Notifications on this phone" row is the way back.
 */
export function PushAsk({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const role = useAppStore((s) => s.role);
  const [busy, setBusy] = useState(false);

  function later() {
    declinePushOffer();
    onClose();
  }

  function turnOn() {
    if (busy) return;
    setBusy(true);
    void syncPushDevice({ ask: true }).finally(() => {
      setBusy(false);
      onClose();
    });
  }

  return (
    <BottomSheet open={open} onClose={later} title={t('pushAskTitle')}>
      <p className="push-ask-body">{t(role === 'coach' ? 'pushAskBodyCoach' : 'pushAskBodyMember')}</p>
      <div className="push-ask-actions">
        <Button onClick={turnOn} disabled={busy}>
          {t('pushTurnOn')}
        </Button>
        <button type="button" className="push-ask-later" onClick={later}>
          {t('pushAskLater')}
        </button>
      </div>
    </BottomSheet>
  );
}

/** Profile's "Notifications on this phone": its state, or the way to turn it on. */
export function PushPhoneRow({ state, onTurnOn, className }: { state: PushPermission | null; onTurnOn: () => void; className: string }) {
  const t = useT();
  if (state === null || state === 'unsupported') return null;
  return (
    <div className={`push-phone-row ${className}`}>
      <div className="push-phone-title">{t('pushRowTitle')}</div>
      {state === 'prompt' ? (
        <button type="button" className="push-phone-turn-on" onClick={onTurnOn}>
          {t('pushTurnOn')}
        </button>
      ) : (
        <div className={`push-phone-state is-${state}`}>{t(state === 'granted' ? 'pushOn' : 'pushDenied')}</div>
      )}
    </div>
  );
}
