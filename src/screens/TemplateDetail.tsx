import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { CloseIcon, PlusIcon, TrashIcon } from '../components/icons';
import {
  TEMPLATE_CADENCES,
  TEMPLATE_PLANS,
  cadenceLabelKey,
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from '../lib/mockStore';
import './TemplateDetail.css';

// 1:1 port of TemplateDetail.dc.html.
//
// Two behaviours carried over from the design rather than tidied: the task
// list writes through on every add and remove, while name/specialty/plan/
// cadence are only committed by Save. It reads oddly side by side, but the
// task rows have no other commit point and changing it would mean inventing
// one the design does not have.
//
// The specialty chips come from lib/specialties.ts, not from the copy of the
// list inlined in the design — same 15 values and same 4 categories, already
// carrying their own i18n keys, so Arabic works here for free.
export default function TemplateDetail() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const templateId = useAppStore((s) => s.params).templateId ?? '';

  const stored = getTemplate(templateId);

  const [name, setName] = useState(stored?.name ?? '');
  const [specialty, setSpecialty] = useState(stored?.specialty ?? 'Life coaching');
  const [plan, setPlan] = useState(stored?.plan ?? TEMPLATE_PLANS[0]);
  const [cadence, setCadence] = useState(stored?.cadence ?? TEMPLATE_CADENCES[0]);
  const [tasks, setTasks] = useState<string[]>(stored?.tasks ?? []);
  const [newTask, setNewTask] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // A template id that no longer resolves (deleted on another tab, or a
  // stale history entry) would otherwise render an empty form that Save
  // would write to nothing.
  if (!stored) {
    return (
      <div className="phone-frame template-detail">
        <div className="template-detail-header">
          <button type="button" className="template-detail-cancel" onClick={back}>{t('templateDetailCancel')}</button>
          <div className="template-detail-heading">{t('templateDetailTitle')}</div>
          <span className="template-detail-save-placeholder" />
        </div>
        <p className="template-detail-missing">{t('templateDetailMissing')}</p>
      </div>
    );
  }

  function addTask() {
    const value = newTask.trim();
    if (!value) return;
    const next = [...tasks, value];
    updateTemplate(templateId, { tasks: next });
    setTasks(next);
    setNewTask('');
  }

  function removeTask(index: number) {
    const next = tasks.filter((_, i) => i !== index);
    updateTemplate(templateId, { tasks: next });
    setTasks(next);
  }

  function save() {
    updateTemplate(templateId, { name: name.trim() || stored!.name, specialty, plan, cadence });
    nav('templates');
  }

  function confirmDelete() {
    deleteTemplate(templateId);
    nav('templates');
  }

  const chipClass = (selected: boolean) => `template-detail-chip${selected ? ' is-selected' : ''}`;

  return (
    <div className="phone-frame template-detail">
      <div className="template-detail-header">
        <button type="button" className="template-detail-cancel" onClick={back}>{t('templateDetailCancel')}</button>
        <div className="template-detail-heading">{t('templateDetailTitle')}</div>
        <button type="button" className="template-detail-save" onClick={save}>{t('templateDetailSave')}</button>
      </div>

      <div className="template-detail-body">
        <div className="template-detail-field">
          <label htmlFor="template-name">{t('templateDetailNameLabel')}</label>
          <input
            id="template-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="template-detail-input"
          />
        </div>

        <div className="template-detail-section">
          <div className="template-detail-section-label">{t('templateDetailSpecialty')}</div>
          {SPECIALTY_CATEGORIES.map((cat) => (
            <div key={cat.key} className="template-detail-group">
              <div className="template-detail-group-title">{t(cat.titleKey)}</div>
              <div className="template-detail-chips">
                {SPECIALTIES.filter((sp) => sp.category === cat.key).map((sp) => (
                  <button
                    key={sp.value}
                    type="button"
                    className={chipClass(specialty === sp.value)}
                    onClick={() => setSpecialty(sp.value)}
                  >
                    {t(sp.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="template-detail-section">
          <div className="template-detail-section-label">{t('templateDetailPlan')}</div>
          <div className="template-detail-chips">
            {TEMPLATE_PLANS.map((p) => (
              <button key={p} type="button" className={chipClass(plan === p)} onClick={() => setPlan(p)}>
                {p === 'Basic' ? t('templatePlanBasic') : t('templatePlanFullAccess')}
              </button>
            ))}
          </div>
        </div>

        <div className="template-detail-section">
          <div className="template-detail-section-label">{t('templateDetailCadence')}</div>
          <div className="template-detail-chips">
            {TEMPLATE_CADENCES.map((c) => (
              <button key={c} type="button" className={chipClass(cadence === c)} onClick={() => setCadence(c)}>
                {t(cadenceLabelKey(c))}
              </button>
            ))}
          </div>
        </div>

        <div className="template-detail-section">
          <div className="template-detail-tasks-head">
            <div className="template-detail-section-label">{t('templateDetailStarterTasks')}</div>
            <div className="template-detail-task-count">{t('templateDetailTaskCount', { count: tasks.length })}</div>
          </div>

          {tasks.map((task, i) => (
            <div key={`${task}-${i}`} className="template-detail-task">
              <span className="template-detail-task-dot" />
              <div className="template-detail-task-label">{task}</div>
              <button
                type="button"
                className="template-detail-task-remove"
                aria-label={t('templateDetailRemoveTask')}
                onClick={() => removeTask(i)}
              >
                <CloseIcon size={13} color="var(--ink-soft)" />
              </button>
            </div>
          ))}

          <div className="template-detail-add-row">
            <input
              type="text"
              placeholder={t('templateDetailAddTaskPlaceholder')}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
            />
            <button type="button" aria-label={t('templateDetailAddTask')} onClick={addTask}>
              <PlusIcon size={14} color="#FFFFFF" />
            </button>
          </div>
        </div>

        <button type="button" className="template-detail-delete" onClick={() => setShowDeleteConfirm(true)}>
          {t('templateDetailDelete')}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="template-detail-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="template-detail-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="template-detail-confirm-icon">
              <TrashIcon size={20} color="var(--red)" />
            </div>
            <div className="template-detail-confirm-title">{t('templateDetailDeleteConfirmTitle')}</div>
            <div className="template-detail-confirm-body">
              {t('templateDetailDeleteConfirmBodyTemplate', { name: name || stored.name })}
            </div>
            <div className="template-detail-confirm-actions">
              <button type="button" className="template-detail-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>
                {t('templateDetailCancel')}
              </button>
              <button type="button" className="template-detail-confirm-delete" onClick={confirmDelete}>
                {t('templateDetailDeleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
