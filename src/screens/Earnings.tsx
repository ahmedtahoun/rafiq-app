import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchOwnPayouts, type PayoutRecord, type PayoutStatus } from '../lib/payoutHistory';
import { useFormat } from '../lib/format';
import { ChevronIcon, SunIcon, MoonIcon, ArrowForwardIcon } from '../components/icons';
import { darken } from '../lib/color';
import { getClient, getEarningsSummary, type PaymentStatus } from '../lib/mockStore';
import './Earnings.css';

// 1:1 port of Earnings.dc.html — real aggregate of recorded payments across
// the roster, with a per-member breakdown.
export default function Earnings() {
  const t = useT();
  const fmt = useFormat();
  const remote = useRemoteSession();
  const back = useAppStore((s) => s.back);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);

  const summary = getEarningsSummary();
  const totalReceivedLabel = fmt.money(summary.totalReceived);
  const paidPct = summary.totalClients > 0 ? Math.round((summary.paidCount / summary.totalClients) * 100) : 0;
  const paidCountLabel = `${summary.paidCount}/${summary.totalClients} ${t('earningsPaid')}`;
  const hasDue = summary.dueCount > 0;
  const dueCountLabel = `${summary.dueCount} ${t('earningsDue')}`;
  const hasPending = summary.pendingCount > 0;
  const pendingSummaryLabel = `${summary.pendingCount} ${t('earningsPendingConfirmation')} · ${fmt.money(summary.pendingTotal)}`;

  const statusDefs: Record<PaymentStatus, { label: string; color: string }> = {
    paid: { label: t('earningsStatusPaid'), color: 'var(--green)' },
    due: { label: t('earningsStatusDue'), color: 'var(--amber)' },
    overdue: { label: t('earningsStatusOverdue'), color: 'var(--red)' },
  };

  const rows = [...summary.byClient]
    .sort((a, b) => b.total - a.total)
    .map((r) => {
      const client = getClient(r.clientId);
      const isPending = r.pending > 0;
      const statusDef = isPending ? { label: t('earningsStatusPending'), color: 'var(--amber)' } : statusDefs[client?.paymentStatus ?? 'due'];
      const clientColor = client?.avatarBg ?? 'var(--accent)';
      return {
        clientId: r.clientId,
        name: r.clientName,
        initials: client?.initials || r.clientName.split(' ').map((w) => w[0]).join('').toUpperCase(),
        avatarGrad: `linear-gradient(135deg, ${clientColor} 0%, ${darken(clientColor, 35)} 100%)`,
        totalLabel: fmt.money(r.total),
        statusLabel: statusDef.label,
        statusColor: statusDef.color,
        hasPending: isPending,
        pendingLabel: isPending ? t('earningsPendingSuffix', { amount: fmt.amount(r.pending) }) : '',
      };
    });

  return (
    <div className="phone-frame earnings-screen">
      <div className="earnings-header">
        <div className="earnings-header-left">
          <button type="button" className="earnings-back" aria-label={t('back')} onClick={back}>
            <ChevronIcon size={16} />
          </button>
          <div className="earnings-title">{t('earningsTitle')}</div>
        </div>
        <button type="button" className="earnings-dark-toggle" aria-label={t('toggleDarkMode')} onClick={() => setDark(!dark)}>
          {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
      </div>

      <div className="earnings-body">
        <div className="earnings-summary-card">
          <div>
            <div className="earnings-summary-label">{t('earningsTotalReceived')}</div>
            <div className="earnings-summary-value">{totalReceivedLabel}</div>
          </div>
          <div className="earnings-progress-track">
            <div className="earnings-progress-fill" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="earnings-summary-row">
            <span className="earnings-paid-count">{paidCountLabel}</span>
            {hasDue && <span className="earnings-due-count">{dueCountLabel}</span>}
          </div>
          {hasPending && <div className="earnings-pending-summary">{pendingSummaryLabel}</div>}
        </div>

        <button type="button" className="earnings-payout-link" onClick={() => nav('payoutAccount')}>
          <div className="earnings-payout-link-text">
            <div className="earnings-payout-link-title">{t('payoutAccountTitle')}</div>
            <div className="earnings-payout-link-sub">{t('payoutAccountSub')}</div>
          </div>
          <ArrowForwardIcon size={15} color="var(--ink-soft)" />
        </button>

        <div className="earnings-list-section">
          <div className="earnings-list-label">{t('earningsByMember')}</div>
          {rows.length > 0 ? (
            <div className="earnings-list">
              {rows.map((r) => (
                <button key={r.clientId} type="button" className="earnings-row" onClick={() => nav({ screen: 'clientDetail', params: { clientId: r.clientId } })}>
                  <div className="earnings-avatar" style={{ background: r.avatarGrad }}>{r.initials}</div>
                  <div className="earnings-row-text">
                    <div className="earnings-row-name">{r.name}</div>
                    <div className="earnings-row-status" style={{ color: r.statusColor }}>{r.statusLabel}</div>
                    {r.hasPending && <div className="earnings-row-pending">{r.pendingLabel}</div>}
                  </div>
                  <div className="earnings-row-total">{r.totalLabel}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="earnings-empty">{t('earningsNoMembers')}</div>
          )}
        </div>

        {remote && <PayoutHistory />}
      </div>
    </div>
  );
}

const PAYOUT_STATUS: Record<PayoutStatus, { label: MessageKey; tone: 'green' | 'red' | 'amber' | 'soft' }> = {
  requested: { label: 'payoutStatusRequested', tone: 'amber' },
  processing: { label: 'payoutStatusProcessing', tone: 'amber' },
  pending: { label: 'payoutStatusPending', tone: 'amber' },
  success: { label: 'payoutStatusSuccess', tone: 'green' },
  failed: { label: 'payoutStatusFailed', tone: 'red' },
  unknown: { label: 'payoutStatusUnknown', tone: 'soft' },
};

type PayoutsLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; payouts: PayoutRecord[] };

/**
 * The money the Rafiq Pro team has sent this coach (the payouts ledger).
 * Signed in only — there are no demo payouts, so signed out the section
 * isn't there rather than showing made-up ones.
 */
function PayoutHistory() {
  const t = useT();
  const fmt = useFormat();
  const [load, setLoad] = useState<PayoutsLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchOwnPayouts().then((result) => {
      if (live) setLoad(result.ok ? { status: 'ready', payouts: result.data } : { status: 'error' });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <section className="earnings-list-section earnings-payouts" aria-labelledby="earnings-payouts-label">
      <h2 id="earnings-payouts-label" className="earnings-list-label">
        {t('earningsPayouts')}
      </h2>
      {load.status === 'loading' && (
        <div className="earnings-empty" role="status">
          {t('loadingEllipsis')}
        </div>
      )}
      {load.status === 'error' && (
        <div className="earnings-payouts-error" role="alert">
          <span>{t('earningsPayoutsLoadFailed')}</span>
          <button
            type="button"
            className="earnings-payouts-retry"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {load.status === 'ready' &&
        (load.payouts.length === 0 ? (
          <div className="earnings-empty">{t('earningsPayoutsEmpty')}</div>
        ) : (
          <ul className="earnings-list earnings-payout-list">
            {load.payouts.map((p) => {
              const status = PAYOUT_STATUS[p.status];
              return (
                <li key={p.id} className="earnings-payout-row">
                  <div className="earnings-row-text">
                    <div className="earnings-payout-amount">{p.currency === 'EGP' ? fmt.money(p.amount) : `${fmt.amount(p.amount)} ${p.currency}`}</div>
                    <div className="earnings-payout-date">{fmt.instantDate(p.createdAt)}</div>
                  </div>
                  <div className={`earnings-payout-status is-${status.tone}`}>{t(status.label)}</div>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
