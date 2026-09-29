import { useEffect } from 'react';
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { useRemoteSession } from '../lib/remoteSession';
import { wallTodayMs } from '../lib/wallClock';
import {
  DEMO_MEMBER_CLIENT_ID,
  getClient,
  getCoachProfile,
  getMemberSessions,
  getMood,
  getPackageStatus,
  getProAggregateRating,
  getRecapForMember,
  getSessionLogs,
  getTasks,
  isCredentialVerified,
  MIN_REVIEWS_FOR_RATING,
  packageStatusOf,
  setMood as mockSetMood,
  TODAY_MS,
  toggleTask as mockToggleTask,
  updateClient as mockUpdateClient,
  type AggregateRating,
  type Client,
  type MoodKey,
  type PackageStatus,
  type Task,
} from '../lib/mockStore';
import {
  addMoodCheckin,
  fetchMemberSpace,
  saveOwnMemberContact,
  setMemberTaskDone,
  type MemberContact,
  type MemberErrorCode,
  type MemberSpace,
  type Relationship,
} from '../lib/memberData';

/**
 * The signed-in member's coaching relationships, fetched once and shared by
 * the member screens step 3 converted (ClientHome, ClientTasks, MyCoaches,
 * ClientCoach, ClientProfile), plus which one they're looking at. A member
 * can have more than one coach; MyCoaches is where they switch.
 *
 * Keyed by user id, like rosterStore. Writes land here only once they
 * succeed.
 */
interface MemberState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  userId: string | null;
  data: MemberSpace | null;
  errorCode: MemberErrorCode | null;
  selectedId: string | null;
  mockVersion: number;
  load: (userId: string) => Promise<void>;
  patch: (fn: (r: Relationship[]) => Relationship[]) => void;
  setContact: (contact: MemberContact) => void;
  select: (clientId: string) => void;
  bumpMock: () => void;
}

// Remembering the choice is a convenience (the next launch opens on the same
// coach), so storage failing just means starting on the first one again.
const selectionKey = (userId: string) => `rafiq_member_relationship_${userId}`;
function readSelection(userId: string): string | null {
  try {
    return localStorage.getItem(selectionKey(userId));
  } catch {
    return null;
  }
}
function writeSelection(userId: string, clientId: string) {
  try {
    localStorage.setItem(selectionKey(userId), clientId);
  } catch {
    // Storage unavailable — the choice lasts for this session only.
  }
}

export const useMemberStore = create<MemberState>((set, get) => ({
  status: 'idle',
  userId: null,
  data: null,
  errorCode: null,
  selectedId: null,
  mockVersion: 0,

  async load(userId) {
    set({ status: 'loading', userId, errorCode: null, selectedId: readSelection(userId) });
    const result = await fetchMemberSpace();
    if (get().userId !== userId) return;
    if (result.ok) set({ status: 'ready', data: result.data });
    else set({ status: 'error', errorCode: result.code });
  },

  patch(fn) {
    const data = get().data;
    if (data) set({ data: { ...data, relationships: fn(data.relationships) } });
  },

  setContact(contact) {
    const data = get().data;
    if (data) set({ data: { ...data, contact } });
  },

  select(clientId) {
    const userId = get().userId;
    if (userId) writeSelection(userId, clientId);
    set({ selectedId: clientId });
  },

  bumpMock() {
    set((s) => ({ mockVersion: s.mockVersion + 1 }));
  },
}));

/** The coach of the relationship being viewed. */
export interface MemberCoachView {
  id: string | null;
  name: string;
  title: string;
  verified: boolean;
  rating: AggregateRating;
  bio: string;
  cert: string;
  avatarPhotoUrl: string;
  coverPhotoUrl: string;
}

/** One relationship, whichever source it came from. */
export interface MemberRelationshipView {
  clientId: string;
  client: Client;
  coach: MemberCoachView;
  tasks: Task[];
  /** null: no package set up yet (only ever for a real relationship). */
  pkg: PackageStatus | null;
  sessionsTogether: number;
  /** The coach's most recent recap, if they've written one. */
  latestRecap: { text: string; atMs: number } | null;
  mood: MoodKey | null;
}

export interface MemberActions {
  toggleTask: (taskId: string) => Promise<boolean>;
  setMood: (mood: MoodKey) => Promise<boolean>;
  saveContact: (contact: MemberContact) => Promise<boolean>;
}

export type MemberSpaceView =
  | { status: 'loading' }
  | { status: 'error'; code: MemberErrorCode; retry: () => void }
  | {
      status: 'ready';
      /** True for Supabase rows, false for the demo member. */
      remote: boolean;
      /** "Today" for these rows — pass to isTaskOverdue / fmt.taskDue. */
      todayMs: number;
      /** Every relationship, for MyCoaches. Archived ones (the coach set
          the roster row inactive) are the member's "past" coaches. */
      relationships: MemberRelationshipView[];
      /** The member's own name and phone. Signed out, the demo member's
          (which the demo keeps on its roster row). */
      contact: MemberContact;
      /** The one being viewed — null for a member no coach has accepted yet. */
      current: MemberRelationshipView | null;
      select: (clientId: string) => void;
      actions: MemberActions;
    };

function coachRating(r: Relationship): AggregateRating {
  const count = r.coach?.ratingCount ?? 0;
  return { count, average: r.coach?.ratingAvg ?? 0, hasEnoughReviews: count >= MIN_REVIEWS_FOR_RATING };
}

function remoteView(r: Relationship, todayMs: number): MemberRelationshipView {
  const recap = r.pastSessions.find((s) => s.recap.trim());
  return {
    clientId: r.client.id,
    client: r.client,
    coach: {
      id: r.coachId,
      name: r.coach?.name ?? '',
      title: r.coach?.title ?? '',
      verified: r.coach?.verified ?? false,
      rating: coachRating(r),
      bio: r.coach?.bio ?? '',
      cert: r.coach?.cert ?? '',
      avatarPhotoUrl: r.coach?.avatarPhotoUrl ?? '',
      coverPhotoUrl: r.coach?.coverPhotoUrl ?? '',
    },
    tasks: r.tasks,
    pkg: r.package ? packageStatusOf(r.package, todayMs) : null,
    sessionsTogether: r.pastSessions.length,
    latestRecap: recap ? { text: recap.recap, atMs: recap.atMs } : null,
    mood: r.mood,
  };
}

function demoView(): MemberRelationshipView {
  const id = DEMO_MEMBER_CLIENT_ID;
  const profile = getCoachProfile();
  const recap = getMemberSessions(id)
    .map((s) => ({ atMs: s.atMs, text: getRecapForMember(id, s.id).trim() }))
    .find((s) => s.text);
  return {
    clientId: id,
    client: getClient(id)!,
    coach: {
      id: null,
      name: profile.name || 'Yasmin El-Sayed',
      title: profile.title || 'Life coaching',
      verified: isCredentialVerified(),
      rating: getProAggregateRating(),
      bio: profile.bio,
      cert: profile.cert,
      avatarPhotoUrl: profile.avatarPhotoUrl,
      coverPhotoUrl: profile.coverPhotoUrl,
    },
    tasks: getTasks(id),
    pkg: getPackageStatus(id),
    // The design's baseline of two sessions before any real log exists.
    sessionsTogether: getSessionLogs(id).length + 2,
    latestRecap: recap ?? null,
    mood: getMood(id),
  };
}

/**
 * Signed out (or unconfigured) this is the demo member, read fresh from
 * mockStore on every render as the screens always did. Signed in, it is the
 * member's own relationships, with loading and error states to render.
 */
export function useMemberSpace(): MemberSpaceView {
  const remote = useRemoteSession();
  const userId = useAppStore((s) => s.userId);
  const status = useMemberStore((s) => s.status);
  const storedFor = useMemberStore((s) => s.userId);
  const data = useMemberStore((s) => s.data);
  const errorCode = useMemberStore((s) => s.errorCode);
  const selectedId = useMemberStore((s) => s.selectedId);
  const load = useMemberStore((s) => s.load);
  const patch = useMemberStore((s) => s.patch);
  const select = useMemberStore((s) => s.select);
  const setContact = useMemberStore((s) => s.setContact);
  const bumpMock = useMemberStore((s) => s.bumpMock);
  useMemberStore((s) => s.mockVersion);

  const stale = remote && userId !== null && (storedFor !== userId || status === 'idle');
  useEffect(() => {
    if (stale && userId) void load(userId);
  }, [stale, userId, load]);

  if (!remote || !userId) {
    const demo = demoView();
    const done = (value: boolean) => {
      bumpMock();
      return Promise.resolve(value);
    };
    return {
      status: 'ready',
      remote: false,
      todayMs: TODAY_MS,
      relationships: [demo],
      contact: { fullName: demo.client.name, phone: demo.client.phone, countryCode: demo.client.countryCode },
      current: demo,
      select: () => {},
      actions: {
        toggleTask: (taskId) => done(!!mockToggleTask(DEMO_MEMBER_CLIENT_ID, taskId)),
        setMood: (mood) => done(!!mockSetMood(DEMO_MEMBER_CLIENT_ID, mood)),
        saveContact: (c) => done(!!mockUpdateClient(DEMO_MEMBER_CLIENT_ID, { name: c.fullName, phone: c.phone, countryCode: c.countryCode })),
      },
    };
  }
  if (stale || status === 'idle' || status === 'loading') return { status: 'loading' };
  if (status === 'error' || !data) return { status: 'error', code: errorCode ?? 'unknown', retry: () => void load(userId) };

  const todayMs = wallTodayMs();
  const views = data.relationships.map((r) => remoteView(r, todayMs));
  // The remembered choice if it's still theirs; otherwise the first
  // current coach, or the first at all.
  const current = views.find((v) => v.clientId === selectedId) ?? views.find((v) => v.client.active) ?? views[0] ?? null;
  const currentId = current?.clientId ?? null;

  return {
    status: 'ready',
    remote: true,
    todayMs,
    relationships: views,
    contact: data.contact,
    current,
    select,
    actions: {
      async saveContact(contact) {
        const result = await saveOwnMemberContact(contact);
        if (result.ok) setContact(contact);
        return result.ok;
      },
      async toggleTask(taskId) {
        const task = current?.tasks.find((t) => t.id === taskId);
        if (!task || !currentId) return false;
        const result = await setMemberTaskDone(taskId, !task.done);
        if (!result.ok) return false;
        patch((rs) => rs.map((r) => (r.client.id === currentId ? { ...r, tasks: r.tasks.map((t) => (t.id === taskId ? { ...t, done: !task.done } : t)) } : r)));
        return true;
      },
      async setMood(mood) {
        if (!currentId) return false;
        const result = await addMoodCheckin(currentId, mood);
        if (!result.ok) return false;
        patch((rs) => rs.map((r) => (r.client.id === currentId ? { ...r, mood } : r)));
        return true;
      },
    },
  };
}
