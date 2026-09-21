import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { darken } from '../lib/color';
import {
  getClients,
  getMessageDraft,
  getMessages,
  getMessagesHref,
  getUnreadMessageCount,
} from '../lib/mockStore';
import './MessagesInbox.css';

// 1:1 port of MessagesInbox.dc.html.
//
// Every roster row is one thread: there is no separate conversation entity,
// just one message log per (client, pro) relationship, which is the design's
// own note on this screen.
//
// Unread counts come from getUnreadMessageCount's existing forRole seam
// rather than a second tally written here — that seam was built to serve the
// coach and member sides from one place.
export default function MessagesInbox() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);

  const threads = getClients()
    .map((client, rosterIndex) => {
      const messages = getMessages(client.id);
      const draft = getMessageDraft(client.id).trim();
      const unread = getUnreadMessageCount(client.id, 'pro');
      const last = messages.length ? messages[messages.length - 1] : null;

      // The preview reflects only what is actually stored: a real last
      // message, else an unsent draft (prefixed so it can never read as a
      // reply that already went out), else nothing. No invented snippets.
      const preview = last
        ? `${last.senderRole === 'pro' ? t('messagesInboxYouPrefix') : ''}${last.text}`
        : draft
          ? `${t('messagesInboxDraftPrefix')}${draft}`
          : t('messagesInboxNoMessagesYet');

      return {
        client,
        href: getMessagesHref(client.id),
        preview,
        isPlaceholder: !last,
        unread,
        rosterIndex,
        // Most recently active first; threads with nothing yet fall to the
        // bottom in their existing roster order.
        sortKey: last ? last.atMs : -1,
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey || a.rosterIndex - b.rosterIndex);

  return (
    <div className="phone-frame messages-inbox">
      <div className="messages-inbox-header">
        <button className="messages-inbox-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="messages-inbox-title">{t('messagesInboxTitle')}</div>
      </div>

      <p className="messages-inbox-intro">{t('messagesInboxSubtitle')}</p>

      <div className="messages-inbox-list">
        {threads.length > 0 ? (
          threads.map((thread) => (
            <button
              key={thread.client.id}
              type="button"
              className="messages-inbox-row"
              onClick={() => nav(thread.href)}
            >
              <div className="messages-inbox-avatar-wrap">
                <div
                  className="messages-inbox-avatar"
                  style={{ background: `linear-gradient(135deg, ${thread.client.avatarBg} 0%, ${darken(thread.client.avatarBg, 35)} 100%)` }}
                >
                  {thread.client.initials}
                </div>
                {thread.unread > 0 && (
                  <span className="messages-inbox-badge" aria-label={t('messagesInboxUnreadLabel', { count: thread.unread })}>
                    {thread.unread > 9 ? '9+' : thread.unread}
                  </span>
                )}
              </div>
              <div className="messages-inbox-text">
                <div className={`messages-inbox-name${thread.unread > 0 ? ' is-unread' : ''}`}>{thread.client.name}</div>
                <div className={`messages-inbox-preview${thread.unread > 0 ? ' is-unread' : ''}${thread.isPlaceholder ? ' is-placeholder' : ''}`}>
                  {thread.preview}
                </div>
              </div>
              <span className="messages-inbox-chevron"><ChevronIcon size={15} color="var(--ink-soft)" /></span>
            </button>
          ))
        ) : (
          <div className="messages-inbox-empty">
            <MessageIcon size={26} color="var(--ink-soft)" />
            <div className="messages-inbox-empty-title">{t('messagesInboxNoMembers')}</div>
            <div className="messages-inbox-empty-sub">{t('messagesInboxNoMembersSub')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
