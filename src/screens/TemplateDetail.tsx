import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, type MessageKey } from '../lib/i18n';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { CloseIcon, PlusIcon, TrashIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import {
  TEMPLATE_CADENCES,
  TEMPLATE_PLANS,
  cadenceLabelKey,
  deleteTemplate,
  getTemplate,
  updateTemplate,
  type Template,
} from '../lib/mockStore';
import { createOwnTemplate, deleteOwnTemplate, fetchOwnTemplates, updateOwnTemplate, type TemplateFields } from '../lib/templateData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
import './TemplateDetail.css';

// 1:1 port of TemplateDetail.dc.html: edits one template, named by
// params.templateId.
//
// Signed in it reads and writes the coach's own rows (templateData.ts), and
// everything, the starter tasks included, is committed by Save: a new
// template ('new') doesn't exist until then, and Cancel leaves nothing
// behind, as with offerings.
//
// Signed out, the demo keeps the design's behaviour: the task list writes
// through on every add and remove, while name/specialty/plan/cadence are
// only committed by Save. It reads oddly side by side, but the demo's task
// rows have no other commit point.
//
// The specialty chips come from lib/specialties.ts, not from the copy of the
// list inlined in the design — same 15 values and same 4 categories, already
// carrying their own i18n keys, so Arabic works here for free.
export default function TemplateDetail() {
  const remote = useRemoteSession();
  const templateId = useAppStore((s) => s.params).templateId ?? '';
  const load = useRemoteLoad('own_templates', remote, fetchOwnTemplates);

  if (!remote) return <DemoTemplateDetail templateId={templateId} />;
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;

  const isNew = templateId === 'new';
  const stored = isNew ? null : load.data.find((tpl) => tpl.id === templateId) ?? null;
  if (!isNew && !stored) return <TemplateMissing />;

  async function save(fields: TemplateFields): Promise<boolean> {
    const result = isNew ? await createOwnTemplate(fields) : await updateOwnTemplate(templateId, fields);
    return result.ok;
  }

  async function remove(): Promise<boolean> {
    return (await deleteOwnTemplate(templateId)).ok;
  }

  return <TemplateForm key={templateId} stored={stored} onSave={save} onDelete={isNew ? null : remove} />;
}

function DemoTemplateDetail({ templateId }: { templateId: string }) {
  // A template id that no longer resolves (deleted on another tab, or a
  // stale history entry) would otherwise render an empty form that Save
  // would write to nothing.
  const stored = getTemplate(templateId);
  if (!stored) return <TemplateMissing />;

  return (
    <TemplateForm
      key={templateId}
      stored={stored}
      onTasksChange={(tasks) => updateTemplate(templateId, { tasks })}
      onSave={async ({ name, specialty, plan, cadence }) => {
        updateTemplate(templateId, { name, specialty, plan, cadence });
        return true;
      }}
      onDelete={async () => {
        deleteTemplate(templateId);
        return true;
      }}
    />
  );
}

function TemplateMissing() {
  const t = useT();
  const back = useAppStore((s) => s.back);
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

function TemplateForm({ stored, onSave, onDelete, onTasksChange }: {
  /** null for a new template. */
  stored: Template | null;
  onSave: (fields: TemplateFields) => Promise<boolean>;
  /** null for a new template: there is nothing to delete yet. */
  onDelete: (() => Promise<boolean>) | null;
  /** The demo's write-through; signed in, tasks are saved with the rest. */
  onTasksChange?: (tasks: string[]) => void;
}) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);

  const [name, setName] = useState(stored?.name ?? '');
  const [specialty, setSpecialty] = useState(stored?.specialty ?? 'Life coaching');
  const [plan, setPlan] = useState(stored?.plan ?? TEMPLATE_PLANS[0]);
  const [cadence, setCadence] = useState(stored?.cadence ?? TEMPLATE_CADENCES[0]);
  const [tasks, setTasks] = useState<string[]>(stored?.tasks ?? []);
  const [newTask, setNewTask] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  // A cleared name keeps the one it had; a new template needs one.
  const finalName = name.trim() || stored?.name || '';
  const canSave = finalName !== '' && !busy;

  function changeTasks(next: string[]) {
    onTasksChange?.(next);
    setTasks(next);
  }

  function addTask() {
    const value = newTask.trim();
    if (!value) return;
    changeTasks([...tasks, value]);
    setNewTask('');
  }

  function removeTask(index: number) {
    changeTasks(tasks.filter((_, i) => i !== index));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const ok = await onSave({ name: finalName, specialty, plan, cadence, tasks });
    setBusy(false);
    if (ok) nav('templates');
    else setError('templateDetailSaveFailed');
  }

  async function confirmDelete() {
    if (!onDelete) return;
    setBusy(true);
    setError(null);
    const ok = await onDelete();
    setBusy(false);
    setShowDeleteConfirm(false);
    if (ok) nav('templates');
    else setError('templateDetailDeleteFailed');
  }

  const chipClass = (selected: boolean) => `template-detail-chip${selected ? ' is-selected' : ''}`;

  return (
    <div className="phone-frame template-detail">
      <div className="template-detail-header">
        <button type="button" className="template-detail-cancel" onClick={back}>{t('templateDetailCancel')}</button>
        <div className="template-detail-heading">{t(stored ? 'templateDetailTitle' : 'templatesNew')}</div>
        <button type="button" className="template-detail-save" disabled={!canSave} onClick={() => void save()}>{t('templateDetailSave')}</button>
      </div>

      <div className="template-detail-body">
        {error && <div className="template-detail-error" role="alert">{t(error)}</div>}

        <div className="template-detail-field">
          <label htmlFor="template-name">{t('templateDetailNameLabel')}</label>
          <input
            id="template-name"
            type="text"
            dir="auto"
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
              <div className="template-detail-task-label"><bdi>{task}</bdi></div>
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
              dir="auto"
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

        {onDelete && (
          <button type="button" className="template-detail-delete" disabled={busy} onClick={() => setShowDeleteConfirm(true)}>
            {t('templateDetailDelete')}
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="template-detail-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="template-detail-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="template-detail-confirm-icon">
              <TrashIcon size={20} color="var(--red)" />
            </div>
            <div className="template-detail-confirm-title">{t('templateDetailDeleteConfirmTitle')}</div>
            <div className="template-detail-confirm-body">
              {t('templateDetailDeleteConfirmBodyTemplate', { name: isolate(finalName) })}
            </div>
            <div className="template-detail-confirm-actions">
              <button type="button" className="template-detail-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>
                {t('templateDetailCancel')}
              </button>
              <button type="button" className="template-detail-confirm-delete" disabled={busy} onClick={() => void confirmDelete()}>
                {t('templateDetailDeleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
