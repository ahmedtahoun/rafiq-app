import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { ChevronIcon, ArrowForwardIcon, PlusIcon } from '../components/icons';
import { getOfferings, setSelectedOfferingId, type OfferingType } from '../lib/mockStore';
import { LoadState } from '../components/LoadState';
import { fetchOwnOfferings } from '../lib/offeringData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
import './Offerings.css';

const TYPE_ICON: Record<OfferingType, string> = { session: '1:1', consultation: 'CN', group: 'GR', workshop: 'WS', program: 'PR', event: 'EV' };
const TYPE_COLOR: Record<OfferingType, string> = {
  session: '#B75C3D', consultation: '#2A8F8F', group: '#3E6FB0', workshop: '#7A6BAE', program: '#3F7D58', event: '#B98900',
};

// 1:1 port of Offerings.dc.html — a coach's catalog of bookable things,
// shown on their Member-facing profile.
export default function Offerings() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const nav = useAppStore((s) => s.nav);
  const { money } = useFormat();
  // Signed in, the coach's own rows (offeringData.ts); signed out, the demo's.
  const remote = useRemoteSession();
  const load = useRemoteLoad('own_offerings', remote, fetchOwnOfferings);

  const TYPE_LABEL: Record<OfferingType, string> = {
    session: t('offeringTypeSession'), consultation: t('offeringTypeConsultation'), group: t('offeringTypeGroup'),
    workshop: t('offeringTypeWorkshop'), program: t('offeringTypeProgram'), event: t('offeringTypeEvent'),
  };
  const FORMAT_LABEL = { online: t('offeringFormatOnline'), in_person: t('offeringFormatInPerson'), both: t('offeringFormatBoth') };

  if (remote && load.status === 'loading') return <LoadState status="loading" />;
  if (remote && load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const list = remote && load.status === 'ready' ? load.data : getOfferings();

  const offerings = list.map((o) => ({
    ...o,
    icon: TYPE_ICON[o.type],
    iconBg: TYPE_COLOR[o.type],
    typeLabel: TYPE_LABEL[o.type],
    formatLabel: FORMAT_LABEL[o.format] ?? FORMAT_LABEL.both,
    priceLabel: o.price > 0 ? money(o.price) : t('offeringsFree'),
  }));

  function openDetail(id: string) {
    // The demo's other screens still read the selected-offering handoff.
    if (!remote) setSelectedOfferingId(id);
    nav({ screen: 'offeringDetail', params: { offeringId: id } });
  }

  // Nothing is created until the coach saves the form.
  function newOffering() {
    nav({ screen: 'offeringDetail', params: { offeringId: 'new' } });
  }

  return (
    <div className="phone-frame offerings-screen">
      <div className="offerings-header">
        <button type="button" className="offerings-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="offerings-title">{t('offeringsTitle')}</div>
      </div>

      <div className="offerings-subtitle">{t('offeringsSubtitle')}</div>

      <div className="offerings-list">
        {offerings.map((o) => (
          <button key={o.id} type="button" className="offerings-card" onClick={() => openDetail(o.id)}>
            <div className="offerings-icon" style={{ background: o.iconBg }}>{o.icon}</div>
            <div className="offerings-card-text">
              <div className="offerings-card-name"><bdi>{o.name}</bdi></div>
              <div className="offerings-card-meta">
                {o.typeLabel} · <bdi>{o.duration || '—'}</bdi> · {o.formatLabel}
              </div>
            </div>
            <div className="offerings-card-price">{o.priceLabel}</div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
        ))}

        {offerings.length === 0 && (
          <div className="offerings-empty">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 8L12 2 3.5 8v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
            <div className="offerings-empty-title">{t('offeringsNoOfferings')}</div>
            <div className="offerings-empty-sub">{t('offeringsNoOfferingsSub')}</div>
          </div>
        )}

        <button type="button" className="offerings-new" onClick={newOffering}>
          <PlusIcon size={16} color="var(--accent)" />
          {t('offeringsNewOffering')}
        </button>
      </div>
    </div>
  );
}
