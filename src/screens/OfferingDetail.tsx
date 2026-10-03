import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, type MessageKey } from '../lib/i18n';
import { TrashIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import {
  OFFERING_TYPE_KEYS,
  createOffering,
  deleteOffering,
  getOfferings,
  getSelectedOfferingId,
  updateOffering,
  type Offering,
  type OfferingFormat,
  type OfferingType,
} from '../lib/mockStore';
import { archiveOwnOffering, createOwnOffering, fetchOwnOfferings, updateOwnOffering, type OfferingFields } from '../lib/offeringData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
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

// 1:1 port of OfferingDetail.dc.html: edits one offering, or a new one.
// Which one comes in as params.offeringId ('new' for a new one). Signed in
// it reads and writes the coach's own rows (offeringData.ts); signed out,
// mockStore's demo catalogue. A new offering is created only on Save: the
// demo used to add a blank "New Offering" the moment the form opened, and
// Cancel left it behind.
export default function OfferingDetail() {
  const remote = useRemoteSession();
  const params = useAppStore((s) => s.params);
  const offeringId = params.offeringId ?? getSelectedOfferingId() ?? 'new';
  const load = useRemoteLoad('own_offerings', remote, fetchOwnOfferings);

  if (remote && load.status === 'loading') return <LoadState status="loading" />;
  if (remote && load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const list = remote && load.status === 'ready' ? load.data : getOfferings();
  const isNew = offeringId === 'new';
  const stored = isNew ? null : list.find((o) => o.id === offeringId) ?? null;
  if (!isNew && !stored) return <OfferingNotFound />;

  async function save(fields: OfferingFields): Promise<boolean> {
    if (!remote) {
      const id = isNew ? createOffering() : offeringId;
      updateOffering(id, fields);
      return true;
    }
    const result = isNew ? await createOwnOffering(fields) : await updateOwnOffering(offeringId, fields);
    return result.ok;
  }

  async function remove(): Promise<boolean> {
    if (!remote) {
      deleteOffering(offeringId);
      return true;
    }
    return (await archiveOwnOffering(offeringId)).ok;
  }

  return <OfferingForm key={offeringId} stored={stored} onSave={save} onDelete={isNew ? null : remove} />;
}

function OfferingNotFound() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  return (
    <div className="phone-frame offering-detail-screen">
      <div className="offering-detail-header">
        <button type="button" className="offering-detail-cancel" onClick={() => nav('offerings')}>{t('back')}</button>
      </div>
      <div className="offering-detail-body">
        <div className="offering-detail-error" role="alert">{t('offeringDetailNotFound')}</div>
      </div>
    </div>
  );
}

function OfferingForm({ stored, onSave, onDelete }: {
  stored: Offering | null;
  onSave: (fields: OfferingFields) => Promise<boolean>;
  /** null for a new offering: there is nothing to delete yet. */
  onDelete: (() => Promise<boolean>) | null;
}) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);

  const [type, setType] = useState<OfferingType>(stored?.type ?? 'session');
  const [name, setName] = useState(stored?.name ?? '');
  const [description, setDescription] = useState(stored?.description ?? '');
  const [duration, setDuration] = useState(stored?.duration ?? '');
  const [price, setPrice] = useState(stored ? String(stored.price) : '');
  const [sessionsTotal, setSessionsTotal] = useState(stored?.sessionsTotal != null ? String(stored.sessionsTotal) : '');
  const [format, setFormat] = useState<OfferingFormat>(stored?.format ?? 'both');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const priceNum = price.trim() === '' ? 0 : Number(price);
  const priceValid = Number.isFinite(priceNum) && priceNum >= 0;
  const canSave = name.trim().length > 0 && priceValid && !busy;

  async function save() {
    if (!canSave) return;
    const trimmed = sessionsTotal.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const sessionsTotalToSave = parsed != null && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    setBusy(true);
    setError(null);
    const ok = await onSave({
      type,
      name: name.trim(),
      description: description.trim(),
      duration: duration.trim(),
      price: priceNum,
      format,
      sessionsTotal: sessionsTotalToSave,
    });
    setBusy(false);
    if (ok) nav('offerings');
    else setError('offeringDetailSaveFailed');
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    setError(null);
    const ok = await onDelete();
    setBusy(false);
    setShowDeleteConfirm(false);
    if (ok) nav('offerings');
    else setError('offeringDetailDeleteFailed');
  }

  const deleteConfirmBody = t('offeringDetailDeleteConfirmBodyTemplate', { name: isolate(name || t('offeringDetailName')) });

  return (
    <div className="phone-frame offering-detail-screen">
      <div className="offering-detail-header">
        <button type="button" className="offering-detail-cancel" onClick={() => nav('offerings')}>{t('offeringDetailCancel')}</button>
        <div className="offering-detail-title">{t(stored ? 'offeringDetailEditOffering' : 'offeringsNewOffering')}</div>
        <button type="button" className="offering-detail-save" disabled={!canSave} onClick={() => void save()}>{t('offeringDetailSave')}</button>
      </div>

      <div className="offering-detail-body">
        {error && <div className="offering-detail-error" role="alert">{t(error)}</div>}

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
          <input id="oname" type="text" dir="auto" className="offering-detail-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('offeringDetailNamePlaceholder')} />
        </div>

        <div className="offering-detail-field">
          <label htmlFor="odesc" className="offering-detail-label">{t('offeringDetailDescription')}</label>
          <textarea id="odesc" dir="auto" rows={3} className="offering-detail-input offering-detail-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('offeringDetailDescriptionPlaceholder')} />
        </div>

        <div className="offering-detail-row">
          <div className="offering-detail-field" style={{ flex: 1 }}>
            <label htmlFor="oduration" className="offering-detail-label">{t('offeringDetailDuration')}</label>
            <input id="oduration" type="text" dir="auto" className="offering-detail-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={t('offeringDetailDurationPlaceholder')} />
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

        {onDelete && (
          <button type="button" className="offering-detail-delete" disabled={busy} onClick={() => setShowDeleteConfirm(true)}>
            {t('offeringDetailDeleteOffering')}
          </button>
        )}
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
              <button type="button" className="offering-detail-confirm-delete" disabled={busy} onClick={() => void remove()}>{t('offeringDetailDelete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
