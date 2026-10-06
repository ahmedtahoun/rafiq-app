/**
 * Unread messages, app-wide: the tab bar's badge and the in-app sound.
 *
 * The inbox always knew a member had written ("1" on their row), but the
 * tab bar didn't, and nothing made a sound, so a coach on any other screen
 * never noticed (reported 5 Oct). Signed in, this counts every thread's
 * unread once, then listens on one realtime channel for new messages; each
 * one re-counts, and a message from the other side plays a short chime —
 * unless they're already in that thread, or their notifications are off.
 *
 * The count is re-read on every screen change too, so leaving a thread
 * (which marks it read) clears its share of the badge.
 *
 * A banner and sound with the app closed is phone notifications (push),
 * LAUNCH-CHECKLIST §6 — a separate piece of work.
 */
import { create } from 'zustand';
import { fetchUnreadTotal, subscribeToMyMessages } from '../lib/messageData';
import { getNotificationPrefs, getProNotificationPrefs, type MessageRole } from '../lib/mockStore';
import { useAppStore } from './appStore';
import { offerPush } from './pushAsk';

export const useUnread = create<{ count: number }>(() => ({ count: 0 }));

/** Whether this person wants to hear about a new message. */
function soundOn(role: MessageRole): boolean {
  if (role === 'pro') return getProNotificationPrefs().enabled;
  const prefs = getNotificationPrefs();
  return prefs.enabled && prefs.messages;
}

/** Whether the thread a message landed in is the one on screen. */
function viewing(role: MessageRole, clientId: string): boolean {
  const { screen, params } = useAppStore.getState();
  if (role === 'pro') return screen === 'messages' && params.clientId === clientId;
  // The member's thread is their current relationship's.
  return screen === 'coachMessages';
}

let audio: AudioContext | null = null;

/** Two soft notes, made in the browser: no sound file to ship. */
function playChimeDefault() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime;
    [880, 1320].forEach((freq, i) => {
      const at = start + i * 0.12;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });
  } catch {
    // No audio (blocked, or no output device): the badge still shows.
  }
}

let playChime = playChimeDefault;

/** Tests only: count chimes instead of making a sound. */
export function setChimePlayer(next: () => void) {
  playChime = next;
}

/** Start counting for the signed-in person. Returns the stop. */
export function startUnreadWatch(role: MessageRole): () => void {
  let stopped = false;
  const refresh = async () => {
    const result = await fetchUnreadTotal(role);
    if (!stopped && result.ok) useUnread.setState({ count: result.data });
  };
  void refresh();
  const unsubscribe = subscribeToMyMessages((m) => {
    void refresh();
    const fromOther = role === 'pro' ? m.senderRole === 'client' : m.senderRole === 'pro';
    if (fromOther && !viewing(role, m.clientId) && soundOn(role)) playChime();
    // A message from the other side: would they like the next on their phone?
    if (fromOther) offerPush();
  });
  const unsubscribeNav = useAppStore.subscribe((s, prev) => {
    if (s.screen !== prev.screen) void refresh();
  });
  return () => {
    stopped = true;
    unsubscribe();
    unsubscribeNav();
    useUnread.setState({ count: 0 });
  };
}
