import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ApiError,
  call,
  coachOf,
  payoutCoachOf,
  PAYOUT_STATUSES,
  type Deletion,
  type Payout,
  type PayoutStatus,
  type Profile,
  type Report,
  type Verification,
} from './api';

/**
 * Every timestamp here is a real instant the server stamped
 * (`created_at`, `submitted_at`, `requested_at`), so it is shown in the
 * reader's own zone — the `fmt.instantDate` half of CLAUDE.md's "two
 * kinds of time", not the UTC calendar half. Rafiq's admins are in
 * Cairo; a report filed at 1 AM must not read as the day before.
 */
function instant(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function who(p: { full_name: string; email: string | null } | null): string {
  if (!p) return 'deleted account';
  return p.email ? `${p.full_name} (${p.email})` : p.full_name;
}

/** Shared loading/error/empty handling, so each queue is just its rows. */
function useQueue<T>(load: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nothing is set synchronously here: the effect below runs this on
  // mount, and a setState inside an effect body starts a second render
  // for no reason. The state moves when the load resolves instead, which
  // is also when an earlier error stops being true.
  const refresh = useCallback(() => {
    load().then(
      (loaded) => {
        setRows(loaded);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [load]);

  useEffect(refresh, [refresh]);
  return { rows, error, refresh, setError };
}

function Queue({ rows, error, empty, children }: {
  rows: unknown[] | null;
  error: string | null;
  empty: string;
  children: ReactNode;
}) {
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <>{children}</>;
}

/**
 * An action that needs a note and must not fire twice. `busy` is held
 * until the refresh finishes, because these operations are conditional
 * on the row's current state: a second click lands a 409, and showing
 * that to an admin who simply clicked twice would be noise.
 */
function useAction(refresh: () => void, setError: (m: string | null) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, body: Parameters<typeof call>[0]) => {
    setBusy(key);
    setError(null);
    try {
      await call(body);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function Reports() {
  const { rows, error, refresh, setError } = useQueue<Report>(
    useCallback(() => call<{ reports: Report[] }>({ op: 'listReports' }).then((r) => r.reports), []),
  );
  const { busy, run } = useAction(refresh, setError);
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <Queue rows={rows} error={error} empty="No open reports.">
      {rows?.map((r) => {
        const note = notes[r.id] ?? '';
        return (
          <article key={r.id} className="card">
            <header>
              <strong>{r.reason.replace(/_/g, ' ')}</strong>
              <time>{instant(r.created_at)}</time>
            </header>
            <p className="details">{r.details || <span className="muted">No details given.</span>}</p>
            <dl>
              <dt>Coach</dt><dd>{who(r.coach)}{r.coach?.account_status === 'suspended' && <span className="pill">suspended</span>}</dd>
              <dt>Reported by</dt><dd>{who(r.reporter)}</dd>
            </dl>
            <label>
              Note (kept on the report)
              <textarea
                value={note}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                rows={2}
              />
            </label>
            <div className="actions">
              <button disabled={busy !== null} onClick={() => run(r.id, { op: 'actionReport', report_id: r.id, note })}>
                Actioned
              </button>
              <button disabled={busy !== null} onClick={() => run(r.id, { op: 'dismissReport', report_id: r.id, note })}>
                Dismiss
              </button>
              {/* `profiles` has nowhere to record why an account was
                  suspended, so the reason lives on the report. Record the
                  decision first, then suspend. */}
              {r.coach && r.coach.account_status !== 'suspended' && (
                <button
                  className="danger"
                  disabled={busy !== null}
                  onClick={() => run(r.id, { op: 'suspend', profile_id: r.coach!.id })}
                >
                  Suspend coach
                </button>
              )}
              {r.coach?.account_status === 'suspended' && (
                <button disabled={busy !== null} onClick={() => run(r.id, { op: 'unsuspend', profile_id: r.coach!.id })}>
                  Unsuspend coach
                </button>
              )}
            </div>
          </article>
        );
      })}
    </Queue>
  );
}

export function Verifications() {
  const { rows, error, refresh, setError } = useQueue<Verification>(
    useCallback(() => call<{ requests: Verification[] }>({ op: 'listVerifications' }).then((r) => r.requests), []),
  );
  const { busy, run } = useAction(refresh, setError);
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <Queue rows={rows} error={error} empty="No pending verification requests.">
      {rows?.map((v) => {
        const note = notes[v.id] ?? '';
        return (
          <article key={v.id} className="card">
            <header>
              <strong>{who(coachOf(v))}</strong>
              <time>{instant(v.submitted_at)}</time>
            </header>
            <p className="details">{v.note || <span className="muted">No note from the coach.</span>}</p>
            <label>
              Reviewer note
              <textarea
                value={note}
                onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))}
                rows={2}
              />
            </label>
            <div className="actions">
              <button disabled={busy !== null} onClick={() => run(v.id, { op: 'approveVerification', request_id: v.id, note })}>
                Approve
              </button>
              <button disabled={busy !== null} onClick={() => run(v.id, { op: 'rejectVerification', request_id: v.id, note })}>
                Reject
              </button>
            </div>
            {/* The coach's badge is not set here: migration 0005's
                verification_requests_sync trigger maps this status onto
                coach_profiles.verification_status. */}
            <p className="muted small">The coach's verified badge follows from this automatically.</p>
          </article>
        );
      })}
    </Queue>
  );
}

export function Deletions() {
  const { rows, error, refresh, setError } = useQueue<Deletion>(
    useCallback(() => call<{ requests: Deletion[] }>({ op: 'listDeletions' }).then((r) => r.requests ?? []), []),
  );
  const { busy, run } = useAction(refresh, setError);

  return (
    <Queue rows={rows} error={error} empty="No pending deletion requests.">
      {rows?.map((d) => (
        <article key={d.id} className="card">
          <header>
            <strong>{d.profiles ? who(d.profiles) : d.profile_id}</strong>
            <time>{instant(d.requested_at)}</time>
          </header>
          {d.profiles && <p className="muted small">{d.profiles.role}</p>}
          {d.note && <p className="details">{d.note}</p>}
          <div className="actions">
            <button
              className="danger"
              disabled={busy !== null}
              onClick={() => {
                // Irreversible, and it runs immediately — the one place
                // in this tool that asks twice.
                if (!confirm(`Carry out deletion for ${d.profiles ? who(d.profiles) : d.profile_id}? This cannot be undone.`)) return;
                run(d.id, { op: 'processDeletion', request_id: d.id });
              }}
            >
              {busy === d.id ? 'Processing…' : 'Process deletion'}
            </button>
          </div>
          {/* The function refuses while a session, credit, dispute or
              payout is still open, and says which — that message is
              shown as-is rather than flattened. */}
          <p className="muted small">
            Refused while anything is still open; the reason appears above if so. Safe to retry.
          </p>
        </article>
      ))}
    </Queue>
  );
}

export function Lookup() {
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const out = await call<{ profiles: Profile[] }>({ op: 'lookupUser', query: term });
      setRows(out.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: Profile) => {
    setError(null);
    try {
      await call({ op: p.account_status === 'suspended' ? 'unsuspend' : 'suspend', profile_id: p.id });
      setRows((rs) => rs?.map((r) => (r.id === p.id ? { ...r, account_status: r.account_status === 'suspended' ? 'active' : 'suspended' } : r)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <form onSubmit={search} className="lookup">
        <label>
          Email or name
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="at least 2 characters" />
        </label>
        <button disabled={busy || term.trim().length < 2}>Search</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {rows && !rows.length && <p className="muted">Nobody matched.</p>}
      {rows?.map((p) => (
        <article key={p.id} className="card row">
          <div>
            <strong>{p.full_name || <span className="muted">no name</span>}</strong>
            <p className="muted small">{p.email ?? 'no email'} · {p.role} · joined {instant(p.created_at)}</p>
          </div>
          <div className="actions">
            <span className={p.account_status === 'active' ? 'pill ok' : 'pill'}>{p.account_status}</span>
            {/* 'deleted' is final: the account has been through
                process_account_deletion() and must not come back. */}
            {p.account_status !== 'deleted' && (
              <button className={p.account_status === 'suspended' ? '' : 'danger'} onClick={() => toggle(p)}>
                {p.account_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
              </button>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

/**
 * Payouts — what Rafiq owes a coach, and moving it.
 *
 * Reading is the admin function's own `listPayouts`; create, send and
 * sync are passed through to the `payouts` function, which owns the
 * Paymob client and the claim that stops a double click paying twice.
 * This view therefore never retries on its own: a failure is shown with
 * the code the function returned, because "not_in_requested_state" and
 * "paymob_not_configured" need different people to do different things.
 *
 * `destination` is already masked when it arrives. There is no unmasked
 * form in this app to leak.
 */
export function Payouts() {
  const [status, setStatus] = useState<PayoutStatus | ''>('');
  const load = useCallback(
    () => call<{ payouts: Payout[] }>(status ? { op: 'listPayouts', status } : { op: 'listPayouts' })
      .then((r) => r.payouts),
    [status],
  );
  const { rows, error, refresh, setError } = useQueue<Payout>(load);
  const { busy, run } = useAction(refresh, setError);

  const [coachId, setCoachId] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');

  function create(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    // Checked here as well as on the server so a typo is a message rather
    // than a round trip; the server's check is the one that counts.
    if (!Number.isFinite(value) || value <= 0) {
      setError('Amount must be a number greater than zero.');
      return;
    }
    run('create', {
      op: 'createPayout',
      coach_id: coachId.trim(),
      amount: value,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
    setAmount('');
    setComment('');
  }

  return (
    <>
      <form className="row" onSubmit={create}>
        <input
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
          placeholder="Coach id (uuid)"
          aria-label="Coach id"
          required
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          aria-label="Amount"
          inputMode="decimal"
          required
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (optional)"
          aria-label="Comment"
        />
        <button type="submit" disabled={busy !== null}>
          {busy === 'create' ? 'Creating…' : 'Create payout'}
        </button>
      </form>
      {/* The coach's saved payout account decides where it goes: the
          payouts function reads coach_payout_accounts and refuses with
          coach_has_no_payout_account if there isn't one. Nothing here
          asks for a destination, so nothing here can send money to one
          that was typed in. */}
      <p className="muted small">
        Destination comes from the coach's saved payout account. A coach without one is refused.
      </p>

      <div className="row">
        <label className="muted small" htmlFor="payout-status">Status</label>
        <select
          id="payout-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PayoutStatus | '')}
        >
          <option value="">All</option>
          {PAYOUT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Queue rows={rows} error={error} empty="No payouts.">
        {(rows ?? []).map((p) => {
          const coach = payoutCoachOf(p);
          return (
            <article key={p.id} className="card">
              <h3>{who(coach)}</h3>
              <p className="muted small">
                {p.amount} {p.currency} · {p.issuer} · <strong>{p.status}</strong>
                {p.destination ? ` · ${p.destination.account_number ?? p.destination.msisdn ?? '—'}` : ''}
              </p>
              <p className="muted small">
                Requested {instant(p.created_at)}
                {p.sent_at ? ` · sent ${instant(p.sent_at)}` : ''}
                {p.settled_at ? ` · settled ${instant(p.settled_at)}` : ''}
              </p>
              {p.comment ? <p>{p.comment}</p> : null}
              {p.status_description ? <p className="muted small">{p.status_description}</p> : null}
              <div className="actions">
                {/* Only a payout still in 'requested' can be sent, and the
                    server enforces that too — this just stops the button
                    being offered for something already on its way. */}
                {p.status === 'requested' ? (
                  <button disabled={busy !== null} onClick={() => run(`send-${p.id}`, { op: 'sendPayout', payout_id: p.id })}>
                    {busy === `send-${p.id}` ? 'Sending…' : 'Send'}
                  </button>
                ) : null}
                {p.status === 'processing' || p.status === 'pending' || p.status === 'unknown' ? (
                  <button disabled={busy !== null} onClick={() => run(`sync-${p.id}`, { op: 'syncPayout', payout_id: p.id })}>
                    {busy === `sync-${p.id}` ? 'Syncing…' : 'Sync'}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </Queue>
    </>
  );
}
