import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import {
  ArrowForwardIcon,
  CheckIcon,
  ChevronIcon,
  MessageIcon,
  MoonIcon,
  PaymentIcon,
  PencilIcon,
  SunIcon,
  WarningIcon,
} from '../components/icons';
import { BottomSheet } from '../components/BottomSheet';
import {
  addPayment,
  formatToday,
  getAddTaskHref,
  getClient,
  getEditClientHref,
  getMessagesHref,
  getPackageStatus,
  getPaymentHistory,
  getRecaps,
  getTasks,
  isPaymentRefunded,
  isTaskOverdue,
  previewRenewExpiry,
  refundPayment,
  renewPackage,
  setRecap,
  toggleTask,
  TODAY_MS,
  updateClient,
  updateTask,
  deleteTask,
  type Task,
} from '../lib/mockStore';
import './ClientDetail.css';

type TaskFilter = 'all' | 'pending' | 'overdue' | 'completed';

// Fixed demo session history — ClientDetail.dc.html hardcodes these same
// two fallback entries directly in renderVals() (never derived from the
// store), ported as-is rather than invented. Real completed sessions would
// extend this list once SessionRoom/#8's "complete session" flow exists.
const DEMO_SESSIONS: { id: string; dateKey: 'clientDetailFallbackNote1' | 'clientDetailFallbackNote2'; date: string }[] = [
  { id: 'sess1', dateKey: 'clientDetailFallbackNote1', date: 'Oct 18, 2025' },
  { id: 'sess2', dateKey: 'clientDetailFallbackNote2', date: 'Oct 11, 2025' },
];

// Days from the fixed "today", not sentences. These used to hold English
// strings like 'Due today', which never matched what the seed actually
// stored ('Due today, 6:00 PM'), so no chip ever showed as selected.
const EDIT_DUE_OPTIONS: { key: string; labelKey: MessageKey; offsetDays: number }[] = [
  { key: 'today', labelKey: 'clientDetailDueToday', offsetDays: 0 },
  { key: 'tomorrow', labelKey: 'clientDetailDueTomorrow', offsetDays: 1 },
  { key: 'week', labelKey: 'clientDetailDueNextWeek', offsetDays: 7 },
];
const DAY_MS = 86400000;

export default function ClientDetail() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const params = useAppStore((s) => s.params);
  const isAr = lang === 'ar';
  const clientId = params.clientId ?? '';

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showPackageSheet, setShowPackageSheet] = useState(false);
  const [showRecordPaymentSheet, setShowRecordPaymentSheet] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Transfer'>('Cash');
  const [showPaymentHistorySheet, setShowPaymentHistorySheet] = useState(false);
  const [showRefundSheet, setShowRefundSheet] = useState(false);
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [showEditTaskSheet, setShowEditTaskSheet] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueAtMs, setEditDueAtMs] = useState(0);
  const [editRecurring, setEditRecurring] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const client = getClient(clientId);
  if (!client) return null;

  const editHref = getEditClientHref(clientId);
  const messagesHref = getMessagesHref(clientId);
  const currency = t('currency');

  const pkgStatus = getPackageStatus(clientId);
  const pkgPct = pkgStatus.total > 0 ? Math.min(100, Math.round((pkgStatus.used / pkgStatus.total) * 100)) : 0;
  const showPkgAlert = pkgStatus.needsAttention;
  const pkgAlertLabel = pkgStatus.isExpired
    ? t('clientDetailExpired')
    : pkgStatus.isOutOfSessions
      ? t('clientDetailNoSessionsLeft')
      : t('clientDetailExpiresInDays', { n: pkgStatus.daysToExpiry });
  const pkgAlertColor = pkgStatus.isExpired || pkgStatus.isOutOfSessions ? 'var(--red)' : 'var(--amber)';
  const pkgAlertBg = pkgStatus.isExpired || pkgStatus.isOutOfSessions ? 'var(--red-bg)' : 'var(--amber-bg)';

  // --- Payment ---------------------------------------------------------
  const paymentHistory = getPaymentHistory(clientId);
  const lastPayment = paymentHistory.find((p) => p.amount > 0) ?? null;
  const hasPendingPayment = !!lastPayment && lastPayment.status === 'pending';
  const paid = !hasPendingPayment && client.paymentStatus === 'paid';
  const paymentStates = {
    paid: { label: t('clientDetailPaymentUpToDate'), color: 'var(--green)', bg: 'var(--green-bg)' },
    due: { label: t('clientDetailPaymentDue'), color: 'var(--amber)', bg: 'var(--amber-bg)' },
    overdue: { label: t('clientDetailPaymentOverdue'), color: 'var(--red)', bg: 'var(--red-bg)' },
  } as const;
  const paymentState = paymentStates[client.paymentStatus];
  const methodLabel = (m: string) => ({ Cash: t('clientDetailMethodCash'), Card: t('clientDetailMethodCard'), Transfer: t('clientDetailMethodTransfer') }[m] ?? m);
  const planLabel = t('clientDetailPlanSuffix', { plan: client.plan });
  const paymentSubtitle = paid
    ? lastPayment
      ? `${fmt.money(lastPayment.amount)} · ${methodLabel(lastPayment.method)} · ${lastPayment.date}`
      : planLabel
    : planLabel;

  function saveRecordPayment() {
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;
    addPayment(clientId, { id: `pay-${Date.now().toString(36)}`, amount: amt, method: paymentMethod, date: formatToday() });
    updateClient(clientId, { paymentStatus: 'paid' });
    setShowRecordPaymentSheet(false);
    refresh();
  }

  // --- Tasks -------------------------------------------------------------
  const clientFirst = client.name.split(' ')[0];
  const allTasks: (Task & { overdue: boolean })[] = getTasks(clientId).map((task) => ({ ...task, overdue: isTaskOverdue(task) }));
  const pendingCount = allTasks.filter((task) => !task.done).length;
  const completedCount = allTasks.filter((task) => task.done).length;
  const overdueCount = allTasks.filter((task) => task.overdue).length;
  const allTasksCount = allTasks.length;
  const taskCompletionPct = allTasksCount ? Math.round((completedCount / allTasksCount) * 100) : 0;

  const visibleTasks = allTasks.filter((task) => {
    if (taskFilter === 'pending') return !task.done;
    if (taskFilter === 'overdue') return task.overdue;
    if (taskFilter === 'completed') return task.done;
    return true;
  });

  const taskFilterDefs: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'all', label: t('clientDetailFilterAll'), count: allTasksCount },
    { key: 'pending', label: t('clientDetailFilterPending'), count: pendingCount },
    { key: 'overdue', label: t('clientDetailFilterOverdue'), count: overdueCount },
    { key: 'completed', label: t('clientDetailFilterCompleted'), count: completedCount },
  ];

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDueAtMs(task.dueAtMs);
    setEditRecurring(!!task.recurring);
    setShowEditTaskSheet(true);
  }

  function saveEditTask() {
    const title = editTitle.trim();
    if (!title || !editingTaskId) return;
    updateTask(clientId, editingTaskId, { title, dueAtMs: editDueAtMs, recurring: editRecurring });
    setShowEditTaskSheet(false);
    refresh();
  }

  function deleteEditTask() {
    if (!editingTaskId) return;
    deleteTask(clientId, editingTaskId);
    setShowEditTaskSheet(false);
    refresh();
  }

  // --- Session history / recaps ------------------------------------------
  const recaps = getRecaps(clientId);

  // --- Package renew -------------------------------------------------------
  const renewOptions = [4, 8, 12];
  function doRenew(n: number) {
    renewPackage(clientId, n);
    setShowPackageSheet(false);
    refresh();
  }

  // --- Refund -------------------------------------------------------------
  function openRefund(paymentId: string, amount: number) {
    setRefundTargetId(paymentId);
    setRefundAmount(String(Math.abs(amount)));
    setRefundReason('');
    setShowRefundSheet(true);
  }
  function saveRefund() {
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0 || !refundTargetId) return;
    refundPayment(clientId, refundTargetId, amt, refundReason || undefined);
    // Refunding puts the client's payment status back to "due" — mirrors
    // ClientDetail.dc.html's own saveRefund behavior.
    updateClient(clientId, { paymentStatus: 'due' });
    setShowRefundSheet(false);
    refresh();
  }

  return (
    <div className="phone-frame client-detail-screen">
      <div className="client-detail-header">
        <div className="client-detail-header-left">
          <button type="button" className="client-detail-back" aria-label={t('backToMembers')} onClick={() => nav('clients')}>
            <ChevronIcon size={16} />
          </button>
          <div className="client-detail-header-title">{t('clientDetailTitle')}</div>
        </div>
        <div className="client-detail-header-actions">
          <button type="button" className="client-detail-icon-btn" aria-label={t('clientDetailEditMember')} onClick={() => nav(editHref)}>
            <PencilIcon size={16} />
          </button>
          <button type="button" className="client-detail-lang-btn" aria-label={t('switchLanguage')} onClick={() => setLang(isAr ? 'en' : 'ar')}>
            {isAr ? 'EN' : 'ع'}
          </button>
          <button type="button" className="client-detail-icon-btn" aria-label={t('toggleDarkMode')} onClick={() => setDark(!dark)}>
            {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
        </div>
      </div>

      <div className="client-detail-body">
        <div className="client-detail-hero">
          <div className="client-detail-hero-top">
            <div className="client-detail-hero-avatar">{client.initials}</div>
            <div className="client-detail-hero-text">
              <div className="client-detail-hero-name">{client.name}</div>
              <div className="client-detail-hero-program">{client.program}</div>
            </div>
          </div>
          <div className="client-detail-hero-stats">
            <div className="client-detail-hero-stat">
              <div className="client-detail-hero-stat-num">{client.progress}%</div>
              <div className="client-detail-hero-stat-label">{t('clientDetailProgress')}</div>
            </div>
            <div className="client-detail-hero-stat-divider" />
            <div className="client-detail-hero-stat">
              <div className="client-detail-hero-stat-num">{pkgStatus.remaining}/{pkgStatus.total}</div>
              <div className="client-detail-hero-stat-label">{t('clientDetailLeft')}</div>
            </div>
            <div className="client-detail-hero-stat-divider" />
            <div className="client-detail-hero-stat">
              <div className="client-detail-hero-stat-num">{t('clientDetailStreakValue')}</div>
              <div className="client-detail-hero-stat-label">{t('clientDetailStreak')}</div>
            </div>
          </div>
        </div>

        <div className="client-detail-message-bar">
          <button type="button" className="client-detail-message-btn" onClick={() => nav(messagesHref)}>
            <MessageIcon size={14} color="#FFFFFF" />
            <span>{t('clientDetailMessage')}</span>
          </button>
        </div>

        <div className="client-detail-section">
          <div className="client-detail-section-header">
            <div className="client-detail-section-title">{t('clientDetailTodoList')}</div>
            <div className="client-detail-tasks-meta">
              <span className="client-detail-tasks-count">{completedCount}/{allTasksCount} {t('clientDetailTasksDone')}</span>
              <button type="button" className="client-detail-add-task" onClick={() => nav(getAddTaskHref(clientId))}>
                {t('clientDetailAddTask')}
              </button>
            </div>
          </div>
          <div className="client-detail-task-filters">
            {taskFilterDefs.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`client-detail-filter-chip${taskFilter === f.key ? ' is-selected' : ''}`}
                onClick={() => setTaskFilter(f.key)}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          {visibleTasks.length > 0 ? (
            visibleTasks.map((task) => (
              <div key={task.id} className="client-detail-task-row">
                <button
                  type="button"
                  className={`client-detail-task-check${task.done ? ' is-done' : ''}${!task.done && task.overdue ? ' is-overdue' : ''}`}
                  aria-label={t('toggleTaskComplete', { task: task.title })}
                  onClick={() => {
                    toggleTask(clientId, task.id);
                    refresh();
                  }}
                >
                  {task.done && <CheckIcon size={13} color="#FFFFFF" />}
                </button>
                <button type="button" className="client-detail-task-main" onClick={() => openEditTask(task)}>
                  <div className={`client-detail-task-title${task.done ? ' is-done' : ''}${!task.done && task.overdue ? ' is-overdue' : ''}`}>{task.title}</div>
                  <div className="client-detail-task-due-row">
                    <span className={`client-detail-task-due${task.overdue ? ' is-overdue' : ''}`}><bdi>{fmt.taskDue(task.dueAtMs, task.dueHasTime)}</bdi></span>
                    {task.recurring && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 2.1l4 4-4 4" /><path d="M3 12.7V12a9 9 0 0 1 15-6.7l3 3" /><path d="M7 21.9l-4-4 4-4" /><path d="M21 11.3V12a9 9 0 0 1-15 6.7l-3-3" />
                      </svg>
                    )}
                  </div>
                </button>
                {task.overdue && (
                  <button type="button" className="client-detail-task-remind" aria-label={t('remindAboutTask', { task: task.title })} onClick={() => nav(messagesHref)}>
                    <MessageIcon size={14} color="#FFFFFF" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="client-detail-empty-card">
              <div className="client-detail-empty-title">{t('clientDetailNoTasksYet')}</div>
              <div className="client-detail-empty-sub">{t('clientDetailNoTasksBody', { name: clientFirst })}</div>
            </div>
          )}
        </div>

        <div className="client-detail-card client-detail-goal-card">
          <div className="client-detail-goal-row">
            <div className="client-detail-goal-text">{t('clientDetailGoalPrefix')}{client.goal || t('clientDetailNoGoalSet')}</div>
            <div className="client-detail-goal-pct">{taskCompletionPct}% {t('clientDetailPctTasksDone')}</div>
          </div>
          <div className="client-detail-progress-track">
            <div className="client-detail-progress-fill" style={{ width: `${client.progress}%` }} />
          </div>
        </div>

        <div className="client-detail-card">
          <div className="client-detail-payment-row">
            <div className="client-detail-payment-icon" style={{ background: paymentState.bg }}>
              <PaymentIcon size={17} color={paymentState.color} />
            </div>
            <div className="client-detail-payment-text">
              <div className="client-detail-payment-title" style={{ color: paymentState.color }}>{paymentState.label}</div>
              <div className="client-detail-payment-sub">{paymentSubtitle}</div>
            </div>
            {!paid && (
              <div className="client-detail-payment-actions">
                <button type="button" className="client-detail-remind-icon" aria-label={t('remindAboutPayment')} onClick={() => nav(messagesHref)}>
                  <MessageIcon size={16} color="#FFFFFF" />
                </button>
                <button
                  type="button"
                  className="client-detail-record-btn"
                  onClick={() => {
                    setPaymentAmount('');
                    setPaymentMethod('Cash');
                    setShowRecordPaymentSheet(true);
                  }}
                >
                  {t('clientDetailRecord')}
                </button>
              </div>
            )}
          </div>
          <button type="button" className="client-detail-view-history" onClick={() => setShowPaymentHistorySheet(true)}>
            {t('clientDetailViewPaymentHistory')}
          </button>
        </div>

        <div className="client-detail-card">
          <div className="client-detail-package-header">
            <div className="client-detail-package-title">{t('clientDetailSessionPackage')}</div>
            <button type="button" className="client-detail-renew-link" onClick={() => setShowPackageSheet(true)}>{t('clientDetailRenew')}</button>
          </div>
          {showPkgAlert && (
            <div className="client-detail-pkg-alert" style={{ background: pkgAlertBg }}>
              <WarningIcon size={11} color={pkgAlertColor} />
              <span style={{ color: pkgAlertColor }}>{pkgAlertLabel}</span>
            </div>
          )}
          <div className="client-detail-pkg-remaining-row">
            <div className="client-detail-pkg-remaining">{pkgStatus.remaining}</div>
            <div className="client-detail-pkg-of">{t('clientDetailOfSessionsLeft', { n: pkgStatus.total })}</div>
          </div>
          <div className="client-detail-progress-track">
            <div className="client-detail-progress-fill" style={{ width: `${pkgPct}%` }} />
          </div>
          <div className="client-detail-pkg-expiry">{t('clientDetailExpiresPrefix')}{fmt.date(pkgStatus.expiresAtMs)}</div>
        </div>

        <div className="client-detail-section">
          <div className="client-detail-section-title">{t('clientDetailSessionHistory')}</div>
          {DEMO_SESSIONS.map((s) => {
            const expanded = expandedSession === s.id;
            return (
              <div key={s.id} className="client-detail-session-card">
                <button type="button" className="client-detail-session-row" onClick={() => setExpandedSession(expanded ? null : s.id)}>
                  <div className="client-detail-session-icon">
                    <CheckIcon size={16} color="var(--green)" />
                  </div>
                  <div className="client-detail-session-text">
                    <div className="client-detail-session-date">{s.date}</div>
                    <div className="client-detail-session-note">{t(s.dateKey)}</div>
                  </div>
                  <span className={`client-detail-session-chevron${expanded ? ' is-open' : ''}`}>
                    <ArrowForwardIcon size={13} color="var(--ink-soft)" />
                  </span>
                </button>
                {expanded && (
                  <div className="client-detail-recap-box">
                    <label className="client-detail-recap-label">{t('clientDetailRecapLabel')}</label>
                    <textarea
                      rows={3}
                      value={recaps[s.id] ?? ''}
                      placeholder={t('clientDetailRecapPlaceholder')}
                      onChange={(e) => {
                        setRecap(clientId, s.id, e.target.value);
                        refresh();
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <BottomSheet open={showPackageSheet} onClose={() => setShowPackageSheet(false)} title={t('clientDetailRenewPackageTitle')}>
        <div className="client-detail-sheet-sub">{t('clientDetailRenewPackageBody', { name: clientFirst, date: previewRenewExpiry() })}</div>
        <div className="client-detail-renew-options">
          {renewOptions.map((n) => (
            <button key={n} type="button" className="client-detail-renew-option" onClick={() => doRenew(n)}>
              {t('clientDetailRenewOptionSuffix', { n })}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={showRecordPaymentSheet} onClose={() => setShowRecordPaymentSheet(false)} title={t('clientDetailRecordPaymentTitle')}>
        <div className="client-detail-sheet-sub">{t('clientDetailForClientPlan', { name: client.name, plan: client.plan })}</div>
        <div className="client-detail-sheet-field">
          <label htmlFor="cdamount">{t('clientDetailAmountLabel', { currency })}</label>
          <input id="cdamount" type="text" inputMode="numeric" placeholder="850" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
        </div>
        <div className="client-detail-sheet-field">
          <label>{t('clientDetailMethodLabel')}</label>
          <div className="client-detail-method-row">
            {(['Cash', 'Card', 'Transfer'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`client-detail-method-chip${paymentMethod === m ? ' is-selected' : ''}`}
                onClick={() => setPaymentMethod(m)}
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="client-detail-sheet-submit" onClick={saveRecordPayment}>{t('clientDetailRecordPaymentBtn')}</button>
      </BottomSheet>

      <BottomSheet open={showPaymentHistorySheet} onClose={() => setShowPaymentHistorySheet(false)} title={t('clientDetailPaymentHistoryTitle')}>
        {paymentHistory.length > 0 ? (
          <div className="client-detail-payment-rows">
            {paymentHistory.map((p) => {
              const isRefundEntry = p.amount < 0;
              const isPending = !isRefundEntry && p.status === 'pending';
              const alreadyRefunded = !isRefundEntry && isPaymentRefunded(clientId, p.id);
              const amountLabel = `${isRefundEntry ? '-' : ''}${fmt.money(Math.abs(p.amount))} · ${isRefundEntry ? t('clientDetailRefund') : methodLabel(p.method)}`;
              const statusTag = isPending ? t('clientDetailPendingTag') : alreadyRefunded ? t('clientDetailRefundedTag') : '';
              return (
                <div key={p.id} className="client-detail-payment-history-row">
                  <div
                    className="client-detail-payment-history-icon"
                    style={{ background: isRefundEntry ? 'var(--red-bg)' : isPending ? 'var(--amber-bg)' : 'var(--green-bg)' }}
                  >
                    <PaymentIcon size={15} color={isRefundEntry ? 'var(--red)' : isPending ? 'var(--amber)' : 'var(--green)'} />
                  </div>
                  <div className="client-detail-payment-history-text">
                    <div className="client-detail-payment-history-top">
                      <span className="client-detail-payment-history-amount">{amountLabel}</span>
                      {statusTag && <span className="client-detail-payment-history-tag">{statusTag}</span>}
                    </div>
                    <div className="client-detail-payment-history-date">{p.date}</div>
                    {isRefundEntry && p.reason && <div className="client-detail-payment-history-reason">{p.reason}</div>}
                  </div>
                  {!isRefundEntry && !isPending && !alreadyRefunded && (
                    <button type="button" className="client-detail-refund-link" onClick={() => openRefund(p.id, p.amount)}>
                      {t('clientDetailRefund')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="client-detail-empty-card">
            <div className="client-detail-empty-title">{t('clientDetailNoPaymentsYet')}</div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={showRefundSheet} onClose={() => setShowRefundSheet(false)} title={t('clientDetailRefundPaymentTitle')}>
        <div className="client-detail-sheet-sub">{t('clientDetailRefundSubtitle', { name: client.name })}</div>
        <div className="client-detail-sheet-field">
          <label htmlFor="cdrefundamount">{t('clientDetailRefundAmountLabel', { currency })}</label>
          <input id="cdrefundamount" type="text" inputMode="numeric" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
        </div>
        <div className="client-detail-sheet-field">
          <label htmlFor="cdrefundreason">{t('clientDetailReasonLabel')}</label>
          <input id="cdrefundreason" type="text" placeholder={t('clientDetailReasonPlaceholder')} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
        </div>
        <button type="button" className="client-detail-sheet-submit client-detail-sheet-submit-danger" onClick={saveRefund}>{t('clientDetailConfirmRefund')}</button>
      </BottomSheet>

      <BottomSheet open={showEditTaskSheet} onClose={() => setShowEditTaskSheet(false)} title={t('clientDetailEditTaskTitle')}>
        <div className="client-detail-sheet-field">
          <label htmlFor="cdetitle">{t('clientDetailTaskTitleLabel')}</label>
          <input id="cdetitle" type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        </div>
        <div className="client-detail-sheet-field">
          <label>{t('clientDetailDueDateLabel')}</label>
          <div className="client-detail-due-chip-row">
            {EDIT_DUE_OPTIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`client-detail-due-chip${editDueAtMs === TODAY_MS + d.offsetDays * DAY_MS ? ' is-selected' : ''}`}
                onClick={() => setEditDueAtMs(TODAY_MS + d.offsetDays * DAY_MS)}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="client-detail-recurring-row">
          <span>{t('clientDetailRepeatsWeekly')}</span>
          <button
            type="button"
            className={`client-detail-switch${editRecurring ? ' is-on' : ''}`}
            role="switch"
            aria-checked={editRecurring}
            onClick={() => setEditRecurring((v) => !v)}
          >
            <span className="client-detail-switch-thumb" />
          </button>
        </div>
        <div className="client-detail-edit-task-actions">
          <button type="button" className="client-detail-delete-task-btn" onClick={deleteEditTask}>{t('clientDetailDelete')}</button>
          <button type="button" className="client-detail-sheet-submit" onClick={saveEditTask}>{t('clientDetailSaveChanges')}</button>
        </div>
      </BottomSheet>
    </div>
  );
}
