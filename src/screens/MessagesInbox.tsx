import { Fragment } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { darken } from '../lib/color';
import { LoadState } from '../components/LoadState';
import {
  getMessageDraft,
  getMessages,
  getMessagesHref,
  getUnreadMessageCount,
} from '../lib/mockStore';
import { fetchInbox } from '../lib/messageData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
import { useRoster } from '../store/rosterStore';
import { CoachTabBar } from '../components/TabBars';
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
  // Signed in, the roster is Supabase's and each row's latest message and
  // unread count come from messageData.fetchInbox (message_reads per side).
  const remote = useRemoteSession();
  const roster = useRoster();
  const ids = roster.status === 'ready' ? roster.clients.map((c) => c.id) : [];
  const inbox = useRemoteLoad(`inbox:${ids.join(',')}`, remote && roster.status === 'ready', () => fetchInbox(ids));

  if (roster.status === 'loading' || (remote && inbox.status === 'loading')) return <LoadState status="loading" />;
  if (roster.status === 'error') return <LoadState status="error" onRetry={roster.retry} />;
  if (remote && inbox.status === 'error') return <LoadState status="error" onRetry={inbox.retry} />;
  const entries = inbox.status === 'ready' ? inbox.data : null;

  const threads = roster.clients
    .map((client, rosterIndex) => {
      const draft = getMessageDraft(client.id).trim();
      let last;
      let unread;
      if (remote) {
        last = entries?.[client.id]?.last ?? null;
        unread = entries?.[client.id]?.unread ?? 0;
      } else {
        const messages = getMessages(client.id);
        last = messages.length ? messages[messages.length - 1] : null;
        unread = getUnreadMessageCount(client.id, 'pro');
      }

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
        <div className="messages-inbox-title">{t('messagesInboxTitle')}</div>
      </div>

      <p className="messages-inbox-intro">{t('messagesInboxSubtitle')}</p>

      <div className="messages-inbox-list">
        {threads.length > 0 ? (
          threads.map((thread, i) => (
            <Fragment key={thread.client.id}>
            {/* Members with nothing yet sit under their own heading, so the
                list doesn't read as a column of empty conversations. */}
            {thread.isPlaceholder && (i === 0 || !threads[i - 1].isPlaceholder) && (
              <div className="messages-inbox-section">{t('messagesInboxStartHeading')}</div>
            )}
            <button
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
                <div className={`messages-inbox-name${thread.unread > 0 ? ' is-unread' : ''}`}><bdi>{thread.client.name}</bdi></div>
                <div className={`messages-inbox-preview${thread.unread > 0 ? ' is-unread' : ''}${thread.isPlaceholder ? ' is-placeholder' : ''}`}>
                  {thread.preview}
                </div>
              </div>
              <span className="messages-inbox-chevron"><ChevronIcon size={15} color="var(--ink-soft)" /></span>
            </button>
            </Fragment>
          ))
        ) : (
          <div className="messages-inbox-empty">
            <MessageIcon size={26} color="var(--ink-soft)" />
            <div className="messages-inbox-empty-title">{t('messagesInboxNoMembers')}</div>
            <div className="messages-inbox-empty-sub">{t('messagesInboxNoMembersSub')}</div>
          </div>
        )}
      </div>
      <CoachTabBar />
    </div>
  );
}
