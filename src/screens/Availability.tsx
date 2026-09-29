import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey } from '../lib/i18n';
import { ChevronIcon } from '../components/icons';
import { BottomSheet } from '../components/BottomSheet';
import { LoadState } from '../components/LoadState';
import { getWeeklyAvailability, setWeeklyAvailability, type WeeklyAvailabilityDay } from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchOwnWeeklyAvailability, saveOwnWeeklyDay } from '../lib/requestData';
import { useRemoteLoad } from '../store/remoteLoad';
import './Availability.css';

// Every 30 minutes, 6:00 AM through 10:00 PM — covers every default block
// plus a reasonable margin either side, without going full slot-by-slot
// (this is a simple weekly recurring-pattern editor, not a per-slot
// calendar), matching Availability.dc.html's own HOUR_OPTIONS.
const HOUR_OPTIONS: number[] = [];
for (let h = 6; h <= 22; h += 0.5) HOUR_OPTIONS.push(h);

function fmtHour(h: number, withPeriod: boolean, amLabel: string, pmLabel: string): string {
  let hh = Math.floor(h) % 12;
  if (hh === 0) hh = 12;
  const mins = Math.round((h % 1) * 60);
  const period = h >= 12 ? pmLabel : amLabel;
  return `${hh}:${mins.toString().padStart(2, '0')}${withPeriod ? ` ${period}` : ''}`;
}
function rangeLabel(startH: number, endH: number, amLabel: string, pmLabel: string): string {
  const samePeriod = (startH >= 12) === (endH >= 12);
  return samePeriod
    ? `${fmtHour(startH, false, amLabel, pmLabel)} – ${fmtHour(endH, true, amLabel, pmLabel)}`
    : `${fmtHour(startH, true, amLabel, pmLabel)} – ${fmtHour(endH, true, amLabel, pmLabel)}`;
}

// 1:1 port of Availability.dc.html — the coach's weekly recurring
// available-hours editor, reached from Schedule's header icon. Signed in, the
// hours are the coach's weekly_availability rows: what members book from.
export default function Availability() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const remote = useRemoteSession();
  const load = useRemoteLoad('weekly_availability', remote, fetchOwnWeeklyAvailability);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editStartH, setEditStartH] = useState<number | null>(null);
  const [editEndH, setEditEndH] = useState<number | null>(null);

  const amLabel = t('scheduleAm');
  const pmLabel = t('schedulePm');

  if (remote && load.status === 'loading') return <LoadState status="loading" />;
  if (remote && load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const weekly = remote && load.status === 'ready' ? load.data : getWeeklyAvailability();

  /** Store one day's change; the screen shows it once it's saved. */
  async function write(updated: WeeklyAvailabilityDay[], i: number): Promise<boolean> {
    if (!remote) {
      setWeeklyAvailability(updated);
      refresh();
      return true;
    }
    if (load.status !== 'ready' || saving) return false;
    setSaving(true);
    setSaveFailed(false);
    const result = await saveOwnWeeklyDay(i, updated[i]);
    setSaving(false);
    if (!result.ok) {
      setSaveFailed(true);
      return false;
    }
    load.set(updated);
    return true;
  }

  function toggleDay(i: number) {
    const day = weekly[i];
    const nextEnabled = !day.enabled;
    let startH = day.startH;
    let endH = day.endH;
    // Turning a day on for the first time (or recovering from a bad
    // leftover value) should never silently surface an inverted or
    // missing range — default to a sensible 9 AM – 5 PM instead.
    if (nextEnabled && !(endH > startH)) {
      startH = 9;
      endH = 17;
    }
    const updated: WeeklyAvailabilityDay[] = weekly.map((d, idx) => (idx === i ? { enabled: nextEnabled, startH, endH } : d));
    void write(updated, i);
  }

  function openEdit(i: number) {
    setEditingDayIdx(i);
    setEditStartH(null);
    setEditEndH(null);
  }
  function closeEdit() {
    setSaveFailed(false);
    setEditingDayIdx(null);
    setEditStartH(null);
    setEditEndH(null);
  }

  const showEditSheet = editingDayIdx !== null;
  const currentEditStartH = editStartH ?? (showEditSheet ? weekly[editingDayIdx].startH : null);
  const currentEditEndH = editEndH ?? (showEditSheet ? weekly[editingDayIdx].endH : null);
  const canSave = showEditSheet && currentEditStartH !== null && currentEditEndH !== null && currentEditEndH > currentEditStartH;
  const showInvalidRange = showEditSheet && currentEditStartH !== null && currentEditEndH !== null && !(currentEditEndH > currentEditStartH);

  async function saveEditDay() {
    if (!canSave || editingDayIdx === null || currentEditStartH === null || currentEditEndH === null) return;
    const updated = weekly.map((d, idx) => (idx === editingDayIdx ? { ...d, startH: currentEditStartH, endH: currentEditEndH } : d));
    // A failed save keeps the sheet open with the chosen hours, and says so.
    if (await write(updated, editingDayIdx)) closeEdit();
  }

  return (
    <div className="phone-frame availability-screen">
      <div className="availability-header">
        <button type="button" className="availability-back" aria-label={t('backToProfile')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="availability-title">{t('availabilityTitle')}</div>
      </div>
      <div className="availability-subtitle-wrap">
        <div className="availability-subtitle">{t('availabilitySubtitle')}</div>
      </div>
      {saveFailed && !showEditSheet && <div className="availability-save-failed" role="alert">{t('availabilitySaveFailed')}</div>}

      <div className="availability-list">
        {weekly.map((d, i) => (
          <div key={i} className="availability-day-card">
            <div className="availability-day-row">
              <div className="availability-day-label">{t(dayKey('dowFull', i))}</div>
              <button
                type="button"
                role="switch"
                aria-checked={d.enabled}
                aria-label={t('availabilityToggleDay', { day: t(dayKey('dowFull', i)) })}
                className={`availability-switch${d.enabled ? ' is-on' : ''}`}
                disabled={saving}
                onClick={() => toggleDay(i)}
              >
                <span className="availability-switch-thumb" />
              </button>
            </div>
            {d.enabled && (
              <button type="button" className="availability-day-range-btn" onClick={() => openEdit(i)}>
                <span className="availability-day-range-label" dir="ltr">{rangeLabel(d.startH, d.endH, amLabel, pmLabel)}</span>
                <ChevronIcon size={14} color="var(--ink-soft)" />
              </button>
            )}
          </div>
        ))}
      </div>

      <BottomSheet open={showEditSheet} onClose={closeEdit}>
        <div className="availability-edit-header">
          <div className="availability-edit-day-label">{showEditSheet ? t(dayKey('dowFull', editingDayIdx)) : ''}</div>
          <button type="button" className="availability-edit-close" aria-label={t('close')} onClick={closeEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="availability-chip-section">
          <div className="availability-chip-label">{t('availabilityStart')}</div>
          <div className="availability-chip-scroll">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                className={`availability-hour-chip${h === currentEditStartH ? ' is-selected' : ''}`}
                onClick={() => setEditStartH(h)}
              >
                {fmtHour(h, true, amLabel, pmLabel)}
              </button>
            ))}
          </div>
        </div>

        <div className="availability-chip-section">
          <div className="availability-chip-label">{t('availabilityEnd')}</div>
          <div className="availability-chip-scroll">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                className={`availability-hour-chip${h === currentEditEndH ? ' is-selected' : ''}`}
                onClick={() => setEditEndH(h)}
              >
                {fmtHour(h, true, amLabel, pmLabel)}
              </button>
            ))}
          </div>
        </div>

        {showInvalidRange && <div className="availability-invalid-range">{t('availabilityInvalidRange')}</div>}
        {saveFailed && <div className="availability-invalid-range" role="alert">{t('availabilitySaveFailed')}</div>}

        <div className="availability-edit-actions">
          <button type="button" className="availability-edit-btn availability-edit-btn-neutral" onClick={closeEdit}>{t('availabilityCancel')}</button>
          <button
            type="button"
            className="availability-edit-btn availability-edit-btn-accent"
            style={!canSave ? { background: 'var(--line)', color: 'var(--ink-soft)' } : undefined}
            disabled={!canSave || saving}
            onClick={() => void saveEditDay()}
          >
            {t('availabilitySave')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
