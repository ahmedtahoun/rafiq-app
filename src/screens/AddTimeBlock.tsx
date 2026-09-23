import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import { addCustomBlock, type TimeBlockKind } from '../lib/mockStore';
import './AddTimeBlock.css';

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

const TYPE_DEFS: { kind: TimeBlockKind; labelKey: MessageKey; color: string; bg: string }[] = [
  { kind: 'available', labelKey: 'scheduleLegendPreferred', color: 'var(--green)', bg: 'var(--green-bg)' },
  { kind: 'busy', labelKey: 'scheduleLegendUnavailable', color: 'var(--red)', bg: 'var(--red-bg)' },
];

// Same tiny start/end time parser as AddTimeBlock.dc.html's own local
// parseTime/formatTime — free-text "5:00 PM" style input rather than a
// native time picker, matching the design.
function parseTime(str: string): number | null {
  const m = str.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3] ? m[3].toLowerCase() : null;
  if (period === 'pm' && h < 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  return h + mins / 60;
}

// 1:1 port of AddTimeBlock.dc.html — day-of-week + start/end time + type
// (available/busy) form, reached from Schedule's "+ Add time block" link.
// The design's own file has no translations() (English-only prototype);
// copy here is original (see i18n.ts's addTimeBlock* keys).
//
// "Repeat weekly" is kept as local UI-only state, never persisted: this
// app's whole calendar lives on one fixed fictional week (see
// mockStore.ts's TODAY_MS/WEEK_START_MS), so a block that "repeats" every
// week is behaviorally identical to a one-off block — there is no second
// week for it to repeat into. time_blocks (0001_init.sql) also has no
// repeat column, matching that same scope decision.
export default function AddTimeBlock() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);

  const [day, setDay] = useState(0);
  const [type, setType] = useState<TimeBlockKind>('available');
  const [repeat, setRepeat] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const startH = parseTime(startTime);
  const endH = parseTime(endTime);
  const canSave = startH !== null && endH !== null && endH > startH;

  function saveBlock() {
    if (startH === null || endH === null || !canSave) return;
    addCustomBlock({
      clientId: null,
      kind: type,
      label: type === 'busy' ? t('scheduleLegendUnavailable') : t('schedulePreferredHours'),
      dayIndex: day,
      startH,
      endH,
    });
    nav('schedule');
  }

  return (
    <div className="phone-frame add-time-block">
      <div className="add-time-block-header">
        <button type="button" className="add-time-block-cancel" onClick={back}>{t('addTimeBlockCancel')}</button>
        <div className="add-time-block-heading">{t('addTimeBlockTitle')}</div>
        <button
          type="button"
          className={`add-time-block-save${canSave ? ' is-enabled' : ''}`}
          onClick={saveBlock}
          disabled={!canSave}
        >
          {t('addTimeBlockSave')}
        </button>
      </div>

      <div className="add-time-block-body">
        <div className="add-time-block-field">
          <div className="add-time-block-field-label">{t('addTimeBlockDayLabel')}</div>
          <div className="add-time-block-chips">
            {DAY_KEYS.map((i) => (
              <button
                key={i}
                type="button"
                className={`add-time-block-day-chip${day === i ? ' is-selected' : ''}`}
                onClick={() => setDay(i)}
              >
                {t(dayKey('dowShort', i))}
              </button>
            ))}
          </div>
        </div>

        <div className="add-time-block-row">
          <div className="add-time-block-field">
            <label htmlFor="atb-start">{t('addTimeBlockStartTime')}</label>
            <div className="add-time-block-input-row">
              <span className="add-time-block-input-icon"><ClockGlyph /></span>
              <input
                id="atb-start"
                type="text"
                placeholder={t('addTimeBlockStartPlaceholder')}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          <div className="add-time-block-field">
            <label htmlFor="atb-end">{t('addTimeBlockEndTime')}</label>
            <div className="add-time-block-input-row">
              <span className="add-time-block-input-icon"><ClockGlyph /></span>
              <input
                id="atb-end"
                type="text"
                placeholder={t('addTimeBlockEndPlaceholder')}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="add-time-block-field">
          <div className="add-time-block-field-label">{t('addTimeBlockTypeLabel')}</div>
          <div className="add-time-block-chips">
            {TYPE_DEFS.map((d) => (
              <button
                key={d.kind}
                type="button"
                className="add-time-block-type-chip"
                style={{ background: type === d.kind ? d.bg : 'var(--surface)', color: type === d.kind ? d.color : 'var(--ink-soft)' }}
                onClick={() => setType(d.kind)}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="add-time-block-recurring">
          <div className="add-time-block-recurring-label">
            <RepeatGlyph />
            <span>{t('addTimeBlockRepeatWeekly')}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={repeat}
            aria-label={t('addTimeBlockRepeatWeekly')}
            className={`add-time-block-switch${repeat ? ' is-on' : ''}`}
            onClick={() => setRepeat((r) => !r)}
          >
            <span className="add-time-block-switch-thumb" />
          </button>
        </div>
        {repeat && (
          <p className="add-time-block-recurring-note">
            {t('addTimeBlockRepeatNote', { day: t(dayKey('dowShort', day)) })}
          </p>
        )}
      </div>

      <div className="add-time-block-footer">
        <button
          type="button"
          className={`add-time-block-submit${canSave ? ' is-enabled' : ''}`}
          onClick={saveBlock}
          disabled={!canSave}
        >
          {t('addTimeBlockSaveButton')}
        </button>
      </div>
    </div>
  );
}

// Two glyphs used only here; icons.tsx is a file every track edits, and
// neither has a second caller to justify going in it (same reasoning as
// AddTask.tsx's own ClockGlyph/RepeatGlyph).
function ClockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function RepeatGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2.1l4 4-4 4" />
      <path d="M3 12.7V12a9 9 0 0 1 15-6.7l3 3" />
      <path d="M7 21.9l-4-4 4-4" />
      <path d="M21 11.3V12a9 9 0 0 1-15 6.7l-3-3" />
    </svg>
  );
}
