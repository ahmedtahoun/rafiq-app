import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { ChevronIcon, CheckIcon } from '../components/icons';
import { darken } from '../lib/color';
import { BottomSheet } from '../components/BottomSheet';
import { getSubscription, logSubscriptionCancelFeedback, setSubscriptionTier, type CancelReason } from '../lib/mockStore';
import './Subscription.css';

const CANCEL_REASONS: { key: CancelReason; labelKey: MessageKey }[] = [
  { key: 'too_expensive', labelKey: 'subscriptionReasonExpensive' },
  { key: 'not_using', labelKey: 'subscriptionReasonNotUsing' },
  { key: 'missing_features', labelKey: 'subscriptionReasonMissingFeatures' },
  { key: 'switching', labelKey: 'subscriptionReasonSwitching' },
  { key: 'other', labelKey: 'subscriptionReasonOther' },
];

type Stage = 'plans' | 'survey' | 'confirmed';

// 1:1 port of Subscription.dc.html — Rafiq Pro plan picker with a mandatory
// exit survey before a downgrade actually takes effect.
export default function Subscription() {
  const t = useT();
  const fmt = useFormat();
  const back = useAppStore((s) => s.back);

  const [stage, setStage] = useState<Stage>('plans');
  const [confirmedKind, setConfirmedKind] = useState<'pro' | 'free' | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReason | null>(null);
  const [cancelNote, setCancelNote] = useState('');

  const sub = getSubscription();
  const isPro = sub.tier === 'pro';

  const currentPlanName = isPro ? t('subscriptionPlanLabelPro') : t('subscriptionPlanLabelFree');
  // setSubscriptionTier always pairs tier: 'pro' with a real renewsAtMs, so
  // this is never null when isPro is true.
  const currentPlanSub = isPro ? t('subscriptionRenewsOn', { date: fmt.date(sub.renewsAtMs as number) }) : t('subscriptionFreeSub');

  const freeFeatures = [t('subscriptionFreeFeature1'), t('subscriptionFreeFeature2'), t('subscriptionFreeFeature3'), t('subscriptionFreeFeature4')];
  const proFeatures = [t('subscriptionProFeature1'), t('subscriptionProFeature2'), t('subscriptionProFeature3'), t('subscriptionProFeature4'), t('subscriptionProFeature5')];

  function upgrade() {
    setSubscriptionTier('pro');
    setConfirmedKind('pro');
    setStage('confirmed');
  }

  function submitCancelSurvey() {
    if (!cancelReason) return;
    logSubscriptionCancelFeedback(cancelReason, cancelNote);
    setSubscriptionTier('free');
    setConfirmedKind('free');
    setStage('confirmed');
  }

  function closeConfirmed() {
    setStage('plans');
    setConfirmedKind(null);
  }

  const proConfirmedBody = t('subscriptionProConfirmedBodyTemplate', { date: fmt.date(getSubscription().renewsAtMs as number) });
  const confirmedTitle = confirmedKind === 'pro' ? t('subscriptionProConfirmedTitle') : t('subscriptionFreeConfirmedTitle');
  const confirmedBody = confirmedKind === 'pro' ? proConfirmedBody : t('subscriptionFreeConfirmedBody');

  if (stage === 'confirmed') {
    return (
      <div className="phone-frame subscription-screen">
        <div className="subscription-confirmed">
          <div className={`subscription-confirmed-icon${confirmedKind === 'pro' ? ' is-pro' : ''}`}>
            <CheckIcon size={28} color={confirmedKind === 'pro' ? 'var(--accent)' : 'var(--green)'} />
          </div>
          <div className="subscription-confirmed-title">{confirmedTitle}</div>
          <div className="subscription-confirmed-body">{confirmedBody}</div>
          <button type="button" className="subscription-confirmed-done" onClick={closeConfirmed}>{t('subscriptionDone')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame subscription-screen">
      <div className="subscription-header">
        <button type="button" className="subscription-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="subscription-title">{t('subscriptionTitle')}</div>
      </div>

      <div className="subscription-body">
        <div className="subscription-hero" style={{ background: `linear-gradient(135deg, var(--accent) 0%, ${darken('#B75C3D', 40)} 100%)` }}>
          <div className="subscription-hero-top">
            {isPro && <CheckIcon size={18} color="#FFFFFF" />}
            <div className="subscription-hero-plan">{currentPlanName}</div>
          </div>
          <div className="subscription-hero-sub">{currentPlanSub}</div>
        </div>

        <div className="subscription-plans">
          <div className={`subscription-plan-card${!isPro ? ' is-current' : ''}`}>
            <div className="subscription-plan-top">
              <div className="subscription-plan-name">{t('subscriptionFreeName')}</div>
              {!isPro && <div className="subscription-plan-badge">{t('subscriptionCurrentPlan')}</div>}
            </div>
            <div className="subscription-plan-price">{t('subscriptionFreePrice')}</div>
            <div className="subscription-plan-features">
              {freeFeatures.map((f) => (
                <div key={f} className="subscription-plan-feature">
                  <CheckIcon size={15} color="var(--green)" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            {isPro && (
              <button type="button" className="subscription-downgrade-btn" onClick={() => setStage('survey')}>
                {t('subscriptionDowngrade')}
              </button>
            )}
          </div>

          <div className={`subscription-plan-card${isPro ? ' is-current' : ''}`}>
            <div className="subscription-plan-top">
              <div className="subscription-plan-name-row">
                <CheckIcon size={17} color="var(--accent)" />
                <div className="subscription-plan-name">{t('subscriptionProName')}</div>
              </div>
              {isPro && <div className="subscription-plan-badge">{t('subscriptionCurrentPlan')}</div>}
            </div>
            <div className="subscription-plan-price">{t('subscriptionProPrice')}</div>
            <div className="subscription-plan-features">
              {proFeatures.map((f) => (
                <div key={f} className="subscription-plan-feature">
                  <CheckIcon size={15} color="var(--accent)" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            {!isPro && (
              <button type="button" className="subscription-upgrade-btn" onClick={upgrade}>
                {t('subscriptionUpgrade')}
              </button>
            )}
          </div>
        </div>

        <div className="subscription-disclaimer">{t('subscriptionDisclaimer')}</div>
      </div>

      <BottomSheet open={stage === 'survey'} onClose={() => setStage('plans')} title={t('subscriptionSurveyTitle')}>
        <div className="subscription-survey-sub">{t('subscriptionSurveySub')}</div>
        <div className="subscription-survey-reasons">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`subscription-reason-row${cancelReason === r.key ? ' is-selected' : ''}`}
              onClick={() => setCancelReason(r.key)}
            >
              <span className="subscription-reason-dot" />
              <span>{t(r.labelKey)}</span>
            </button>
          ))}
        </div>
        <div className="subscription-survey-note-field">
          <label htmlFor="cnote" className="subscription-survey-note-label">{t('subscriptionSurveyNoteLabel')}</label>
          <textarea
            id="cnote"
            rows={3}
            className="subscription-survey-note"
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder={t('subscriptionSurveyNotePlaceholder')}
          />
        </div>
        <button type="button" className="subscription-survey-submit" disabled={!cancelReason} onClick={submitCancelSurvey}>
          {t('subscriptionSurveySubmit')}
        </button>
        <button type="button" className="subscription-survey-keep" onClick={() => setStage('plans')}>
          {t('subscriptionSurveyKeepPro')}
        </button>
      </BottomSheet>
    </div>
  );
}
