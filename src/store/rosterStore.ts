import { useEffect } from 'react';
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { useRemoteSession } from '../lib/remoteSession';
import { wallTodayMs } from '../lib/wallClock';
import {
  addClient as mockAddClient,
  addTask as mockAddTask,
  deleteTask as mockDeleteTask,
  getClients,
  getFavorites,
  getTasks,
  toggleFavorite as mockToggleFavorite,
  TODAY_MS,
  updateClient as mockUpdateClient,
  updateTask as mockUpdateTask,
  type Client,
  type NewClientFields,
  type Task,
} from '../lib/mockStore';
import {
  addRosterClient,
  addRosterTask,
  deleteRosterTask,
  fetchRoster,
  setRosterFavourite,
  updateRosterClient,
  updateRosterTask,
  type ClientPatch,
  type NewTask,
  type Roster,
  type RosterErrorCode,
  type TaskPatch,
} from '../lib/rosterData';

/**
 * The signed-in coach's roster (clients, favourites, tasks), fetched once and
 * shared by Clients, ClientDetail, AddClient, EditClient and AddTask, so a
 * change on one is already on the next. Keyed by user id, like
 * ownProfileStore. Writes go to Supabase first and land here only once they
 * succeed — a failed write leaves the screen showing what is really stored.
 */
interface RosterState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  userId: string | null;
  data: Roster | null;
  errorCode: RosterErrorCode | null;
  /** Bumped by every mockStore write, so screens reading mockStore re-render. */
  mockVersion: number;
  load: (userId: string) => Promise<void>;
  patch: (fn: (r: Roster) => Roster) => void;
  bumpMock: () => void;
}

export const useRosterStore = create<RosterState>((set, get) => ({
  status: 'idle',
  userId: null,
  data: null,
  errorCode: null,
  mockVersion: 0,

  async load(userId) {
    set({ status: 'loading', userId, errorCode: null });
    const result = await fetchRoster();
    if (get().userId !== userId) return;
    if (result.ok) set({ status: 'ready', data: result.data });
    else set({ status: 'error', errorCode: result.code });
  },

  patch(fn) {
    const data = get().data;
    if (data) set({ data: fn(data) });
  },

  bumpMock() {
    set((s) => ({ mockVersion: s.mockVersion + 1 }));
  },
}));

export interface RosterActions {
  /** The new client, or null if it wasn't saved. */
  addClient: (fields: NewClientFields) => Promise<Client | null>;
  updateClient: (clientId: string, patch: ClientPatch) => Promise<boolean>;
  toggleFavourite: (clientId: string) => Promise<boolean>;
  addTask: (clientId: string, task: NewTask) => Promise<boolean>;
  updateTask: (clientId: string, taskId: string, patch: TaskPatch) => Promise<boolean>;
  deleteTask: (clientId: string, taskId: string) => Promise<boolean>;
}

export type RosterView =
  | { status: 'loading' }
  | { status: 'error'; code: RosterErrorCode; retry: () => void }
  | {
      status: 'ready';
      /** True for Supabase rows, false for mockStore's demo roster. */
      remote: boolean;
      /** "Today" for these rows: the real day for Supabase's, the fixed
          week's for mockStore's. Pass it to isTaskOverdue / fmt.taskDue. */
      todayMs: number;
      clients: Client[];
      favourites: Record<string, boolean>;
      client: (clientId: string) => Client | undefined;
      tasksOf: (clientId: string) => Task[];
      actions: RosterActions;
    };

const replaceClient = (r: Roster, clientId: string, fn: (c: Client) => Client): Roster => ({
  ...r,
  clients: r.clients.map((c) => (c.id === clientId ? fn(c) : c)),
});
const replaceTasks = (r: Roster, clientId: string, fn: (tasks: Task[]) => Task[]): Roster => ({
  ...r,
  tasks: { ...r.tasks, [clientId]: fn(r.tasks[clientId] ?? []) },
});

function mockActions(bump: () => void): RosterActions {
  const done = <T,>(value: T) => {
    bump();
    return Promise.resolve(value);
  };
  return {
    addClient: (fields) => done(mockAddClient(fields)),
    updateClient: (id, patch) => done(!!mockUpdateClient(id, patch)),
    toggleFavourite: (id) => done(!!mockToggleFavorite(id)),
    addTask: (clientId, task) => done(!!mockAddTask(clientId, { ...task, id: `t${Date.now().toString(36)}` })),
    updateTask: (clientId, taskId, patch) => done(!!mockUpdateTask(clientId, taskId, patch)),
    deleteTask: (clientId, taskId) => done(!!mockDeleteTask(clientId, taskId)),
  };
}

function remoteActions(patch: RosterState['patch'], favourites: () => Record<string, boolean>): RosterActions {
  return {
    async addClient(fields) {
      const result = await addRosterClient(fields);
      if (!result.ok) return null;
      patch((r) => ({ ...r, clients: [...r.clients, result.data], tasks: { ...r.tasks, [result.data.id]: [] } }));
      return result.data;
    },
    async updateClient(clientId, changes) {
      const result = await updateRosterClient(clientId, changes);
      if (!result.ok) return false;
      patch((r) =>
        replaceClient(r, clientId, (c) => ({
          ...c,
          ...changes,
          initials: changes.name !== undefined ? changes.name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2) : c.initials,
        })),
      );
      return true;
    },
    async toggleFavourite(clientId) {
      const next = !favourites()[clientId];
      const result = await setRosterFavourite(clientId, next);
      if (!result.ok) return false;
      patch((r) => ({ ...r, favourites: { ...r.favourites, [clientId]: next } }));
      return true;
    },
    async addTask(clientId, task) {
      const result = await addRosterTask(clientId, task);
      if (!result.ok) return false;
      patch((r) => replaceTasks(r, clientId, (tasks) => [...tasks, result.data]));
      return true;
    },
    async updateTask(clientId, taskId, changes) {
      const result = await updateRosterTask(taskId, changes);
      if (!result.ok) return false;
      patch((r) => replaceTasks(r, clientId, (tasks) => tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t))));
      return true;
    },
    async deleteTask(clientId, taskId) {
      const result = await deleteRosterTask(taskId);
      if (!result.ok) return false;
      patch((r) => replaceTasks(r, clientId, (tasks) => tasks.filter((t) => t.id !== taskId)));
      return true;
    },
  };
}

/**
 * Signed out (or unconfigured) this is mockStore, read fresh on every render
 * as the screens always did. Signed in, it is the shared Supabase copy, with
 * loading and error states the screen has to render.
 */
export function useRoster(): RosterView {
  const remote = useRemoteSession();
  const userId = useAppStore((s) => s.userId);
  const status = useRosterStore((s) => s.status);
  const storedFor = useRosterStore((s) => s.userId);
  const data = useRosterStore((s) => s.data);
  const errorCode = useRosterStore((s) => s.errorCode);
  const load = useRosterStore((s) => s.load);
  const patch = useRosterStore((s) => s.patch);
  const bumpMock = useRosterStore((s) => s.bumpMock);
  useRosterStore((s) => s.mockVersion);

  const stale = remote && userId !== null && (storedFor !== userId || status === 'idle');
  useEffect(() => {
    if (stale && userId) void load(userId);
  }, [stale, userId, load]);

  if (!remote || !userId) {
    const clients = getClients();
    return {
      status: 'ready',
      remote: false,
      todayMs: TODAY_MS,
      clients,
      favourites: getFavorites(),
      client: (id) => clients.find((c) => c.id === id),
      tasksOf: getTasks,
      actions: mockActions(bumpMock),
    };
  }
  if (stale || status === 'idle' || status === 'loading') return { status: 'loading' };
  if (status === 'error' || !data) return { status: 'error', code: errorCode ?? 'unknown', retry: () => void load(userId) };
  return {
    status: 'ready',
    remote: true,
    todayMs: wallTodayMs(),
    clients: data.clients,
    favourites: data.favourites,
    client: (id) => data.clients.find((c) => c.id === id),
    tasksOf: (id) => data.tasks[id] ?? [],
    actions: remoteActions(patch, () => useRosterStore.getState().data?.favourites ?? {}),
  };
}
