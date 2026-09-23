import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey } from '../lib/i18n';
import { ChevronIcon } from '../components/icons';
import { BottomSheet } from '../components/BottomSheet';
import { getWeeklyAvailability, setWeeklyAvailability, type WeeklyAvailabilityDay } from '../lib/mockStore';
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
// available-hours editor, reached from Schedule's header icon.
export default function Availability() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editStartH, setEditStartH] = useState<number | null>(null);
  const [editEndH, setEditEndH] = useState<number | null>(null);

  const weekly = getWeeklyAvailability();
  const amLabel = t('scheduleAm');
  const pmLabel = t('schedulePm');

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
    setWeeklyAvailability(updated);
    refresh();
  }

  function openEdit(i: number) {
    setEditingDayIdx(i);
    setEditStartH(null);
    setEditEndH(null);
  }
  function closeEdit() {
    setEditingDayIdx(null);
    setEditStartH(null);
    setEditEndH(null);
  }

  const showEditSheet = editingDayIdx !== null;
  const currentEditStartH = editStartH ?? (showEditSheet ? weekly[editingDayIdx].startH : null);
  const currentEditEndH = editEndH ?? (showEditSheet ? weekly[editingDayIdx].endH : null);
  const canSave = showEditSheet && currentEditStartH !== null && currentEditEndH !== null && currentEditEndH > currentEditStartH;
  const showInvalidRange = showEditSheet && currentEditStartH !== null && currentEditEndH !== null && !(currentEditEndH > currentEditStartH);

  function saveEditDay() {
    if (!canSave || editingDayIdx === null || currentEditStartH === null || currentEditEndH === null) return;
    const updated = weekly.map((d, idx) => (idx === editingDayIdx ? { ...d, startH: currentEditStartH, endH: currentEditEndH } : d));
    setWeeklyAvailability(updated);
    closeEdit();
    refresh();
  }

  return (
    <div className="phone-frame availability-screen">
      <div className="availability-header">
        <button type="button" className="availability-back" aria-label="Back to profile" onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="availability-title">{t('availabilityTitle')}</div>
      </div>
      <div className="availability-subtitle-wrap">
        <div className="availability-subtitle">{t('availabilitySubtitle')}</div>
      </div>

      <div className="availability-list">
        {weekly.map((d, i) => (
          <div key={i} className="availability-day-card">
            <div className="availability-day-row">
              <div className="availability-day-label">{t(dayKey('dowFull', i))}</div>
              <button
                type="button"
                role="switch"
                aria-checked={d.enabled}
                aria-label="Toggle availability"
                className={`availability-switch${d.enabled ? ' is-on' : ''}`}
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
          <button type="button" className="availability-edit-close" aria-label="Close" onClick={closeEdit}>
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

        <div className="availability-edit-actions">
          <button type="button" className="availability-edit-btn availability-edit-btn-neutral" onClick={closeEdit}>{t('availabilityCancel')}</button>
          <button
            type="button"
            className="availability-edit-btn availability-edit-btn-accent"
            style={!canSave ? { background: 'var(--line)', color: 'var(--ink-soft)' } : undefined}
            disabled={!canSave}
            onClick={saveEditDay}
          >
            {t('availabilitySave')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
