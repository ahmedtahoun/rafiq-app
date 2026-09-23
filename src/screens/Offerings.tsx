import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, ArrowForwardIcon, PlusIcon } from '../components/icons';
import { createOffering, getOfferings, setSelectedOfferingId, type OfferingType } from '../lib/mockStore';
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
  const lang = useAppStore((s) => s.lang);
  const isAr = lang === 'ar';
  const currency = isAr ? 'جنيه' : 'EGP';

  const TYPE_LABEL: Record<OfferingType, string> = {
    session: t('offeringTypeSession'), consultation: t('offeringTypeConsultation'), group: t('offeringTypeGroup'),
    workshop: t('offeringTypeWorkshop'), program: t('offeringTypeProgram'), event: t('offeringTypeEvent'),
  };
  const FORMAT_LABEL = { online: t('offeringFormatOnline'), in_person: t('offeringFormatInPerson'), both: t('offeringFormatBoth') };

  const offerings = getOfferings().map((o) => ({
    ...o,
    icon: TYPE_ICON[o.type],
    iconBg: TYPE_COLOR[o.type],
    meta: `${TYPE_LABEL[o.type]} · ${o.duration || '—'} · ${FORMAT_LABEL[o.format] ?? FORMAT_LABEL.both}`,
    priceLabel: o.price > 0 ? `${o.price} ${currency}` : t('offeringsFree'),
  }));

  function openDetail(id: string) {
    setSelectedOfferingId(id);
    nav('offeringDetail');
  }

  function newOffering() {
    const id = createOffering();
    setSelectedOfferingId(id);
    nav('offeringDetail');
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
              <div className="offerings-card-name">{o.name}</div>
              <div className="offerings-card-meta">{o.meta}</div>
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
