import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { isolate, useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { ChevronIcon, CheckIcon } from '../components/icons';
import { darken } from '../lib/color';
import { BottomSheet } from '../components/BottomSheet';
import { LoadState } from '../components/LoadState';
import { logSubscriptionCancelFeedback, setSubscriptionTier, type CancelReason } from '../lib/mockStore';
import { usePlan, type Plan, type PlanTier } from '../lib/planData';
import { SUPPORT_EMAIL } from '../lib/support';
import './Subscription.css';

const CANCEL_REASONS: { key: CancelReason; labelKey: MessageKey }[] = [
  { key: 'too_expensive', labelKey: 'subscriptionReasonExpensive' },
  { key: 'not_using', labelKey: 'subscriptionReasonNotUsing' },
  { key: 'missing_features', labelKey: 'subscriptionReasonMissingFeatures' },
  { key: 'switching', labelKey: 'subscriptionReasonSwitching' },
  { key: 'other', labelKey: 'subscriptionReasonOther' },
];

type Stage = 'plans' | 'survey' | 'confirmed';

// The three plans, lowest first (0024). Prices are the store products'
// (LAUNCH-CHECKLIST §3); the caps are planData's MEMBER_CAP, which the
// database enforces.
// `soon` marks a feature that isn't built yet: the card may not claim it
// as if it were (CLAUDE.md, "Do not let copy claim something the app does
// not do").
const PLANS: { tier: PlanTier; nameKey: MessageKey; priceKey: MessageKey; yearlyKey: MessageKey | null; featureKeys: MessageKey[]; soon?: MessageKey[] }[] = [
  {
    tier: 'free', nameKey: 'subscriptionFreeName', priceKey: 'subscriptionFreePrice', yearlyKey: null,
    featureKeys: ['subscriptionFreeFeature1', 'subscriptionFreeFeature2', 'subscriptionFreeFeature3', 'subscriptionFreeFeature4', 'subscriptionFreeFeature5'],
  },
  {
    tier: 'pro', nameKey: 'subscriptionProName', priceKey: 'subscriptionProPrice', yearlyKey: 'subscriptionProYearly',
    featureKeys: ['subscriptionProFeature1', 'subscriptionProFeature2'],
  },
  {
    tier: 'elite_pro', nameKey: 'subscriptionEliteName', priceKey: 'subscriptionElitePrice', yearlyKey: 'subscriptionEliteYearly',
    featureKeys: ['subscriptionEliteFeature1', 'subscriptionEliteFeature2', 'subscriptionEliteFeature3', 'subscriptionEliteFeature4'],
    soon: ['subscriptionEliteFeature3', 'subscriptionEliteFeature4'],
  },
];

const PLAN_LABEL: Record<PlanTier, MessageKey> = {
  free: 'subscriptionPlanLabelFree',
  pro: 'subscriptionPlanLabelPro',
  elite_pro: 'subscriptionPlanLabelElite',
};

const rank = (tier: PlanTier) => PLANS.findIndex((p) => p.tier === tier);

// Upgrading is the one direction that needs money to change hands, and a
// coach subscription is a digital subscription: on iOS it has to go through
// In-App Purchase, on Android through Play Billing (LAUNCH-CHECKLIST.md §3).
// Neither is built, so the button says so instead of quietly setting the
// tier to 'pro' for free, which is what it used to do.
//
// Signed in, the plan is the coach's subscriptions row (planData.ts), which
// only service_role writes: there is no self-serve downgrade, so a paid
// coach is pointed at support instead. The downgrade survey is the demo's.
export default function Subscription() {
  const plan = usePlan();
  if (plan.status === 'loading') return <LoadState status="loading" />;
  if (plan.status === 'error') return <LoadState status="error" onRetry={plan.retry} showBack />;
  return <SubscriptionView plan={plan.plan} remote={plan.remote} />;
}

// Subscription.dc.html's plan picker, with a third plan since 0024, and its
// mandatory exit survey before a downgrade actually takes effect.
function SubscriptionView({ plan, remote }: { plan: Plan; remote: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const back = useAppStore((s) => s.back);

  const [stage, setStage] = useState<Stage>('plans');
  const [cancelReason, setCancelReason] = useState<CancelReason | null>(null);
  const [cancelNote, setCancelNote] = useState('');

  // The demo's downgrade below changes the stored tier; this screen shows it
  // without waiting for the plan to be read again.
  const [tier, setTier] = useState(plan.tier);
  const isPaid = tier !== 'free';

  const currentPlanName = t(PLAN_LABEL[tier]);
  // A real renewal is an instant Supabase stored; the demo's is a date on
  // the fixed calendar (CLAUDE.md, "Two kinds of time").
  const renewsOn = plan.renewsAt === null ? null : remote ? fmt.instantDate(plan.renewsAt) : fmt.date(Date.parse(plan.renewsAt));
  const currentPlanSub = !isPaid ? t('subscriptionFreeSub') : renewsOn ? t('subscriptionRenewsOn', { date: renewsOn }) : t('subscriptionProNoEnd');

  function submitCancelSurvey() {
    if (!cancelReason) return;
    logSubscriptionCancelFeedback(cancelReason, cancelNote);
    setSubscriptionTier('free');
    setTier('free');
    setStage('confirmed');
  }

  function closeConfirmed() {
    setStage('plans');
  }

  // Downgrading is the only confirmable outcome left: upgrading cannot
  // complete until billing exists.
  const confirmedTitle = t('subscriptionFreeConfirmedTitle');
  const confirmedBody = t('subscriptionFreeConfirmedBody');

  if (stage === 'confirmed') {
    return (
      <div className="phone-frame subscription-screen">
        <div className="subscription-confirmed">
          <div className="subscription-confirmed-icon">
            <CheckIcon size={28} color="var(--green)" />
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
            {isPaid && <CheckIcon size={18} color="#FFFFFF" />}
            <div className="subscription-hero-plan">{currentPlanName}</div>
          </div>
          <div className="subscription-hero-sub">{currentPlanSub}</div>
        </div>

        <div className="subscription-plans">
          {PLANS.map((p) => {
            const current = p.tier === tier;
            const paidCard = p.tier !== 'free';
            const color = paidCard ? 'var(--accent)' : 'var(--green)';
            return (
              <div key={p.tier} className={`subscription-plan-card${current ? ' is-current' : ''}`} data-tier={p.tier}>
                <div className="subscription-plan-top">
                  {paidCard ? (
                    <div className="subscription-plan-name-row">
                      <CheckIcon size={17} color="var(--accent)" />
                      <div className="subscription-plan-name">{t(p.nameKey)}</div>
                    </div>
                  ) : (
                    <div className="subscription-plan-name">{t(p.nameKey)}</div>
                  )}
                  {current && <div className="subscription-plan-badge">{t('subscriptionCurrentPlan')}</div>}
                </div>
                <div className="subscription-plan-price">{t(p.priceKey)}</div>
                {p.yearlyKey && <div className="subscription-plan-yearly">{t(p.yearlyKey)}</div>}
                <div className="subscription-plan-features">
                  {p.featureKeys.map((k) => (
                    <div key={k} className="subscription-plan-feature">
                      <CheckIcon size={15} color={color} />
                      <span>{t(k)}</span>
                      {p.soon?.includes(k) && <span className="subscription-feature-soon">{t('comingSoonBadge')}</span>}
                    </div>
                  ))}
                </div>
                {p.tier === 'free' && isPaid && !remote && (
                  <button type="button" className="subscription-downgrade-btn" onClick={() => setStage('survey')}>
                    {t('subscriptionDowngrade')}
                  </button>
                )}
                {rank(p.tier) > rank(tier) && (
                  <div className="subscription-upgrade-soon">
                    <span className="subscription-soon-badge">{t('comingSoonBadge')}</span>
                    <span className="subscription-soon-note">{t('subscriptionUpgradeSoonNote')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="subscription-disclaimer">
          {remote && isPaid ? t('subscriptionManageNote', { email: isolate(SUPPORT_EMAIL) }) : t('subscriptionDisclaimer')}
        </div>
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
