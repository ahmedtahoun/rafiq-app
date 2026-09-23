import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, SunIcon, MoonIcon } from '../components/icons';
import { darken } from '../lib/color';
import { getClient, getEarningsSummary, type PaymentStatus } from '../lib/mockStore';
import './Earnings.css';

// 1:1 port of Earnings.dc.html — real aggregate of recorded payments across
// the roster, with a per-member breakdown.
export default function Earnings() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);

  const summary = getEarningsSummary();
  const totalReceivedLabel = `${summary.totalReceived.toLocaleString()} EGP`;
  const paidPct = summary.totalClients > 0 ? Math.round((summary.paidCount / summary.totalClients) * 100) : 0;
  const paidCountLabel = `${summary.paidCount}/${summary.totalClients} ${t('earningsPaid')}`;
  const hasDue = summary.dueCount > 0;
  const dueCountLabel = `${summary.dueCount} ${t('earningsDue')}`;
  const hasPending = summary.pendingCount > 0;
  const pendingSummaryLabel = `${summary.pendingCount} ${t('earningsPendingConfirmation')} · ${summary.pendingTotal.toLocaleString()} EGP`;

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
        totalLabel: `${r.total.toLocaleString()} EGP`,
        statusLabel: statusDef.label,
        statusColor: statusDef.color,
        hasPending: isPending,
        pendingLabel: isPending ? t('earningsPendingSuffix', { amount: r.pending.toLocaleString() }) : '',
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
      </div>
    </div>
  );
}
