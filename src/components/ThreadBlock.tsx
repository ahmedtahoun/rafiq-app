import { isolate, useT } from '../lib/i18n';
import './ThreadBlock.css';

/**
 * Blocking from inside a thread, for both sides (Messages and
 * CoachMessages): a header button for this side's own block, and the
 * confirmation that blocking asks for. Unblocking needs no confirmation.
 * Apple requires blocking wherever users message each other (guideline 1.2).
 */
export function BlockToggle({ name, blockedByMe, busy, onClick }: { name: string; blockedByMe: boolean; busy: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="thread-block-toggle"
      aria-label={t(blockedByMe ? 'messagesUnblockLabel' : 'messagesBlockLabel', { name: isolate(name) })}
      disabled={busy}
      onClick={onClick}
    >
      {t(blockedByMe ? 'messagesUnblock' : 'messagesBlock')}
    </button>
  );
}

export function BlockConfirm({ name, busy, onConfirm, onCancel }: { name: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="thread-block-confirm" role="alertdialog" aria-label={t('messagesBlockLabel', { name: isolate(name) })}>
      <p>{t('messagesBlockConfirm', { name: isolate(name) })}</p>
      <div className="thread-block-confirm-actions">
        <button type="button" className="thread-block-cancel" onClick={onCancel} disabled={busy}>{t('messagesBlockCancel')}</button>
        <button type="button" className="thread-block-yes" onClick={onConfirm} disabled={busy}>{t('messagesBlock')}</button>
      </div>
    </div>
  );
}
