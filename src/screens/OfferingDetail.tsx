import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { TrashIcon } from '../components/icons';
import {
  OFFERING_TYPE_KEYS,
  deleteOffering,
  getSelectedOfferingId,
  updateOffering,
  getOffering,
  type Offering,
  type OfferingFormat,
  type OfferingType,
} from '../lib/mockStore';
import './OfferingDetail.css';

const TYPE_KEY: Record<OfferingType, MessageKey> = {
  session: 'offeringTypeSession', consultation: 'offeringTypeConsultation', group: 'offeringTypeGroup',
  workshop: 'offeringTypeWorkshop', program: 'offeringTypeProgram', event: 'offeringTypeEvent',
};

const FORMAT_DEFS: { key: OfferingFormat; labelKey: MessageKey }[] = [
  { key: 'online', labelKey: 'offeringDetailFormatOnline' },
  { key: 'in_person', labelKey: 'offeringDetailFormatInPerson' },
  { key: 'both', labelKey: 'offeringDetailFormatBoth' },
];

// 1:1 port of OfferingDetail.dc.html — edits the offering set by
// Offerings.tsx's card tap / "New Offering" button (getSelectedOfferingId,
// same cross-screen handoff store.js uses for template selection).
export default function OfferingDetail() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const offeringId = getSelectedOfferingId();
  const stored: Partial<Offering> = (offeringId && getOffering(offeringId)) || {};

  const [type, setType] = useState<OfferingType>(stored.type ?? 'session');
  const [name, setName] = useState(stored.name ?? '');
  const [description, setDescription] = useState(stored.description ?? '');
  const [duration, setDuration] = useState(stored.duration ?? '');
  const [price, setPrice] = useState(stored.price != null ? String(stored.price) : '');
  const [sessionsTotal, setSessionsTotal] = useState(stored.sessionsTotal != null ? String(stored.sessionsTotal) : '');
  const [format, setFormat] = useState<OfferingFormat>(stored.format ?? 'both');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canSave = name.trim().length > 0 && !!offeringId;

  function save() {
    if (!canSave || !offeringId) return;
    const trimmed = sessionsTotal.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const sessionsTotalToSave = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
    updateOffering(offeringId, {
      type,
      name: name.trim(),
      description: description.trim(),
      duration: duration.trim(),
      price: price === '' ? 0 : Number(price),
      format,
      sessionsTotal: sessionsTotalToSave,
    });
    nav('offerings');
  }

  function remove() {
    if (offeringId) deleteOffering(offeringId);
    nav('offerings');
  }

  const deleteConfirmBody = t('offeringDetailDeleteConfirmBodyTemplate', { name: name || t('offeringDetailName') });

  return (
    <div className="phone-frame offering-detail-screen">
      <div className="offering-detail-header">
        <button type="button" className="offering-detail-cancel" onClick={() => nav('offerings')}>{t('offeringDetailCancel')}</button>
        <div className="offering-detail-title">{t('offeringDetailEditOffering')}</div>
        <button type="button" className="offering-detail-save" disabled={!canSave} onClick={save}>{t('offeringDetailSave')}</button>
      </div>

      <div className="offering-detail-body">
        <div className="offering-detail-field">
          <div className="offering-detail-label">{t('offeringDetailType')}</div>
          <div className="offering-detail-chip-wrap">
            {OFFERING_TYPE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`offering-detail-chip${type === key ? ' is-selected' : ''}`}
                onClick={() => setType(key)}
              >
                {t(TYPE_KEY[key])}
              </button>
            ))}
          </div>
        </div>

        <div className="offering-detail-field">
          <label htmlFor="oname" className="offering-detail-label">{t('offeringDetailName')}</label>
          <input id="oname" type="text" className="offering-detail-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('offeringDetailNamePlaceholder')} />
        </div>

        <div className="offering-detail-field">
          <label htmlFor="odesc" className="offering-detail-label">{t('offeringDetailDescription')}</label>
          <textarea id="odesc" rows={3} className="offering-detail-input offering-detail-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('offeringDetailDescriptionPlaceholder')} />
        </div>

        <div className="offering-detail-row">
          <div className="offering-detail-field" style={{ flex: 1 }}>
            <label htmlFor="oduration" className="offering-detail-label">{t('offeringDetailDuration')}</label>
            <input id="oduration" type="text" className="offering-detail-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={t('offeringDetailDurationPlaceholder')} />
          </div>
          <div className="offering-detail-field" style={{ flex: 1 }}>
            <label htmlFor="oprice" className="offering-detail-label">{t('offeringDetailPriceLabel')}</label>
            <input id="oprice" type="number" min={0} className="offering-detail-input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t('offeringDetailPricePlaceholder')} />
          </div>
        </div>

        <div className="offering-detail-field">
          <label htmlFor="ototal" className="offering-detail-label">{t('offeringDetailSessionsTotal')}</label>
          <input id="ototal" type="number" min={0} step={1} className="offering-detail-input" value={sessionsTotal} onChange={(e) => setSessionsTotal(e.target.value)} placeholder={t('offeringDetailSessionsTotalPlaceholder')} />
          <div className="offering-detail-hint">{t('offeringDetailSessionsTotalHint')}</div>
        </div>

        <div className="offering-detail-field">
          <div className="offering-detail-label">{t('offeringDetailFormat')}</div>
          <div className="offering-detail-format-row">
            {FORMAT_DEFS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`offering-detail-format-chip${format === d.key ? ' is-selected' : ''}`}
                onClick={() => setFormat(d.key)}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="offering-detail-delete" onClick={() => setShowDeleteConfirm(true)}>
          {t('offeringDetailDeleteOffering')}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="offering-detail-confirm-backdrop">
          <div className="offering-detail-confirm-panel">
            <div className="offering-detail-confirm-icon">
              <TrashIcon size={20} color="var(--red)" />
            </div>
            <div className="offering-detail-confirm-title">{t('offeringDetailDeleteConfirmTitle')}</div>
            <div className="offering-detail-confirm-body">{deleteConfirmBody}</div>
            <div className="offering-detail-confirm-actions">
              <button type="button" className="offering-detail-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>{t('offeringDetailCancel')}</button>
              <button type="button" className="offering-detail-confirm-delete" onClick={remove}>{t('offeringDetailDelete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
