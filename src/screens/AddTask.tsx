import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ScheduleIcon } from '../components/icons';
import { addTask, getClient } from '../lib/mockStore';
import './AddTask.css';

type DueKey = 'today' | 'tomorrow' | 'week';
const DUE_KEYS: DueKey[] = ['today', 'tomorrow', 'week'];

// 1:1 port of AddTask.dc.html — the new-task form reached from a member's
// detail screen.
//
// Parametrized on clientId, like ClientDetail: the prototype ships one file
// per member (AddTask-omar, AddTask-mona, …) because it has no way to pass
// one, which is exactly what the router's params exist for.
export default function AddTask() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const clientId = useAppStore((s) => s.params).clientId ?? '';

  const client = getClient(clientId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState<DueKey>('today');
  const [exactDate, setExactDate] = useState('');
  const [exactTime, setExactTime] = useState('');
  const [recurring, setRecurring] = useState(false);

  const canSave = title.trim().length > 0;

  function save() {
    if (!canSave) return;
    const date = exactDate.trim();
    const time = exactTime.trim();
    // An exact date wins over the chip, and only then is the time appended —
    // a time with no date has nothing to qualify, same as the design.
    const dueLabel = date
      ? t('addTaskDueExact', { date, time: time ? t('addTaskDueTimeSuffix', { time }) : '' })
      : t(`addTaskDueLabel_${due}`);

    addTask(clientId, {
      id: `t${Date.now().toString(36)}`,
      title: title.trim(),
      description: description.trim(),
      due: dueLabel,
      recurring,
      done: false,
    });
    nav({ screen: 'clientDetail', params: { clientId } });
  }

  if (!client) {
    return (
      <div className="phone-frame add-task">
        <div className="add-task-header">
          <button type="button" className="add-task-cancel" onClick={back}>{t('addTaskCancel')}</button>
          <div className="add-task-heading">{t('addTaskTitle')}</div>
          <span className="add-task-save-placeholder" />
        </div>
        <p className="add-task-missing">{t('addTaskMissingClient')}</p>
      </div>
    );
  }

  const avatarBg = client.avatarBg || 'var(--accent)';

  return (
    <div className="phone-frame add-task">
      <div className="add-task-header">
        <button type="button" className="add-task-cancel" onClick={back}>{t('addTaskCancel')}</button>
        <div className="add-task-heading">{t('addTaskTitle')}</div>
        <button
          type="button"
          className={`add-task-save${canSave ? ' is-enabled' : ''}`}
          onClick={save}
          disabled={!canSave}
        >
          {t('addTaskSave')}
        </button>
      </div>

      <div className="add-task-body">
        <div className="add-task-for">
          <div
            className="add-task-for-avatar"
            style={{ background: `linear-gradient(135deg, ${avatarBg} 0%, ${darken(avatarBg, 35)} 100%)` }}
          >
            {client.initials}
          </div>
          <div className="add-task-for-label">{t('addTaskForMember', { name: client.name })}</div>
        </div>

        <div className="add-task-field">
          <label htmlFor="task-title">{t('addTaskTitleLabel')}</label>
          <input
            id="task-title"
            type="text"
            placeholder={t('addTaskTitlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="add-task-field">
          <label htmlFor="task-desc">{t('addTaskDescriptionLabel')}</label>
          <textarea
            id="task-desc"
            rows={3}
            placeholder={t('addTaskDescriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="add-task-field">
          <div className="add-task-field-label">{t('addTaskDueDate')}</div>
          <div className="add-task-chips">
            {DUE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`add-task-chip${due === key ? ' is-selected' : ''}`}
                onClick={() => setDue(key)}
              >
                {t(`addTaskDueChip_${key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="add-task-exact">
          <div className="add-task-field">
            <label htmlFor="task-date">{t('addTaskExactDate')}</label>
            <div className="add-task-input-row">
              <span className="add-task-input-icon"><ScheduleIcon size={14} color="var(--accent)" /></span>
              <input
                id="task-date"
                type="text"
                placeholder={t('addTaskExactDatePlaceholder')}
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
              />
            </div>
          </div>
          <div className="add-task-field">
            <label htmlFor="task-time">{t('addTaskDueTime')}</label>
            <div className="add-task-input-row">
              <span className="add-task-input-icon"><ClockGlyph /></span>
              <input
                id="task-time"
                type="text"
                placeholder={t('addTaskDueTimePlaceholder')}
                value={exactTime}
                onChange={(e) => setExactTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="add-task-recurring">
          <div className="add-task-recurring-label">
            <RepeatGlyph />
            <span>{t('addTaskRepeatsWeekly')}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={recurring}
            aria-label={t('addTaskRepeatsWeekly')}
            className={`add-task-switch${recurring ? ' is-on' : ''}`}
            onClick={() => setRecurring((r) => !r)}
          >
            <span className="add-task-switch-thumb" />
          </button>
        </div>
        {recurring && <p className="add-task-recurring-note">{t('addTaskRecurringNote')}</p>}
      </div>

      <div className="add-task-footer">
        <button
          type="button"
          className={`add-task-submit${canSave ? ' is-enabled' : ''}`}
          onClick={save}
          disabled={!canSave}
        >
          {t('addTaskSubmit')}
        </button>
      </div>
    </div>
  );
}

// Two glyphs used only here; icons.tsx is a file every track edits, and
// neither has a second caller to justify going in it.
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
