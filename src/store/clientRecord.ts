import { useCallback, useEffect, useState } from 'react';
import { useRosterStore } from './rosterStore';
import {
  addPayment,
  formatToday,
  getPackageStatus,
  getPaymentHistory,
  getRecaps,
  isPaymentRefunded,
  packageStatusOf,
  refundPayment,
  renewPackage,
  setRecap,
  updateClient,
  type PackageStatus,
  type PaymentStatus,
  type RawPackage,
} from '../lib/mockStore';
import {
  fetchClientRecord,
  recordRosterPayment,
  refundRosterPayment,
  renewRosterPackage,
  setSessionRecap,
  type ClientRecord,
  type SessionEntry,
} from '../lib/rosterData';

/** A ledger row as ClientDetail draws it, from either source. */
export interface PaymentRow {
  id: string;
  /** Negative for a refund. */
  amount: number;
  method: string;
  /** mockStore keeps a written date; a real row has a timestamp. */
  date: { label: string } | { wallMs: number };
  pending: boolean;
  refunded: boolean;
  reason: string;
}

export interface ClientRecordActions {
  renew: (addSessions: number) => Promise<boolean>;
  recordPayment: (amount: number, method: string) => Promise<boolean>;
  refund: (paymentId: string, amount: number, reason: string) => Promise<boolean>;
  setRecap: (sessionId: string, text: string) => Promise<boolean>;
}

export type ClientRecordView =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      /** null: no package set up yet (only ever for a real client). */
      pkg: PackageStatus | null;
      payments: PaymentRow[];
      /** Real sessions, newest first — or null for mockStore's demo
          client, whose screen shows the design's two fixed entries. */
      sessions: SessionEntry[] | null;
      /** mockStore's recaps for those fixed entries, by id. */
      demoRecaps: Record<string, string>;
      actions: ClientRecordActions;
    };

function setRosterPaymentStatus(clientId: string, paymentStatus: PaymentStatus) {
  useRosterStore.getState().patch((r) => ({ ...r, clients: r.clients.map((c) => (c.id === clientId ? { ...c, paymentStatus } : c)) }));
}

/**
 * One relationship's sessions, package and payments, for ClientDetail.
 * `remote` and `todayMs` come from useRoster(), so both always agree on
 * which source and which "today" the screen is showing.
 */
export function useClientRecord(clientId: string, remote: boolean, todayMs: number): ClientRecordView {
  const bumpMock = useRosterStore((s) => s.bumpMock);
  useRosterStore((s) => s.mockVersion);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ClientRecord }>({ status: 'loading' });

  // 'retry' shows the loading state again; 'background' keeps the current
  // record on screen while re-reading after a write.
  const load = useCallback(
    async (mode: 'retry' | 'background') => {
      if (mode === 'retry') setState({ status: 'loading' });
      const result = await fetchClientRecord(clientId);
      if (result.ok) setState({ status: 'ready', data: result.data });
      else if (mode !== 'background') setState({ status: 'error' });
      return result.ok;
    },
    [clientId],
  );

  useEffect(() => {
    if (!remote) return;
    let live = true;
    void fetchClientRecord(clientId).then((result) => {
      if (live) setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error' });
    });
    return () => {
      live = false;
    };
  }, [remote, clientId]);

  if (!remote) {
    const history = getPaymentHistory(clientId);
    const done = (value: boolean) => {
      bumpMock();
      return Promise.resolve(value);
    };
    return {
      status: 'ready',
      pkg: getPackageStatus(clientId),
      payments: history.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        date: { label: p.date },
        pending: p.amount > 0 && p.status === 'pending',
        refunded: p.amount > 0 && isPaymentRefunded(clientId, p.id),
        reason: p.reason ?? '',
      })),
      sessions: null,
      demoRecaps: getRecaps(clientId),
      actions: {
        renew: (n) => done(!!renewPackage(clientId, n)),
        recordPayment: (amount, method) => {
          addPayment(clientId, { id: `pay-${Date.now().toString(36)}`, amount, method: method as 'Cash' | 'Card' | 'Transfer', date: formatToday() });
          updateClient(clientId, { paymentStatus: 'paid' });
          return done(true);
        },
        refund: (paymentId, amount, reason) => {
          refundPayment(clientId, paymentId, amount, reason || undefined);
          // Refunding puts the member back to "due", as ClientDetail.dc.html does.
          updateClient(clientId, { paymentStatus: 'due' });
          return done(true);
        },
        setRecap: (sessionId, text) => done(!!setRecap(clientId, sessionId, text)),
      },
    };
  }

  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', retry: () => void load('retry') };

  const record = state.data;
  const refundedIds = new Set(record.payments.filter((p) => p.refundOf).map((p) => p.refundOf));
  const current: RawPackage | null = record.package;
  // Every write is followed by a quiet re-read, so the screen shows what
  // was stored (a refund row's id, the package's new expiry) rather than a
  // local guess at it.
  const thenReload = async (ok: boolean) => ok && (await load('background'));

  return {
    status: 'ready',
    pkg: current ? packageStatusOf(current, todayMs) : null,
    payments: record.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      date: { wallMs: p.paidAtMs },
      pending: p.pending,
      refunded: p.amount > 0 && refundedIds.has(p.id),
      reason: p.reason,
    })),
    sessions: record.sessions,
    demoRecaps: {},
    actions: {
      renew: async (n) => thenReload((await renewRosterPackage(clientId, current, n, todayMs)).ok),
      async recordPayment(amount, method) {
        const result = await recordRosterPayment(clientId, amount, method);
        if (result.ok) setRosterPaymentStatus(clientId, 'paid');
        return thenReload(result.ok);
      },
      async refund(paymentId, amount, reason) {
        const charge = record.payments.find((p) => p.id === paymentId);
        if (!charge) return false;
        const result = await refundRosterPayment(clientId, charge, amount, reason);
        if (result.ok) setRosterPaymentStatus(clientId, 'due');
        return thenReload(result.ok);
      },
      async setRecap(sessionId, text) {
        const result = await setSessionRecap(sessionId, text);
        if (result.ok) {
          setState({ status: 'ready', data: { ...record, sessions: record.sessions.map((s) => (s.id === sessionId ? { ...s, recap: text } : s)) } });
        }
        return result.ok;
      },
    },
  };
}
