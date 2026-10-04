import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, getSupabase } from './supabase';
import { Deletions, Lookup, Reports, Verifications } from './queues';

const TABS = {
  reports: { label: 'Reports', view: Reports },
  verifications: { label: 'Verification', view: Verifications },
  deletions: { label: 'Deletions', view: Deletions },
  lookup: { label: 'User lookup', view: Lookup },
} as const;

type TabKey = keyof typeof TABS;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>('reports');

  useEffect(() => {
    if (!configured) return;
    getSupabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // A build with no project to talk to says so, rather than failing
  // inside createClient or rendering nothing. See src/supabase.ts for why
  // this is a screen and not a throw.
  if (!configured) {
    return (
      <main className="centre">
        <h1>Rafiq admin</h1>
        <p className="error" role="alert">
          This build has no Supabase project. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> and build again — see <code>admin/.env.example</code>.
        </p>
      </main>
    );
  }

  if (!ready) return <main className="centre"><p className="muted">Loading…</p></main>;

  if (!session) {
    return (
      <main className="centre">
        <h1>Rafiq admin</h1>
        <p className="muted">
          Sign in with the Google account that is in <code>admin_users</code>.
        </p>
        <button
          onClick={() =>
            getSupabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
          }
        >
          Sign in with Google
        </button>
        {/* Signing in is all this does. Whether the account may act is
            decided by the Edge Function, not here — a non-admin signs in
            fine and then gets a 403 from every operation. */}
      </main>
    );
  }

  const View = TABS[tab].view;
  return (
    <>
      <header className="bar">
        <h1>Rafiq admin</h1>
        <nav>
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <button key={key} className={key === tab ? 'tab on' : 'tab'} onClick={() => setTab(key)}>
              {TABS[key].label}
            </button>
          ))}
        </nav>
        <div className="me">
          <span className="muted small">{session.user.email}</span>
          <button onClick={() => getSupabase().auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main>
        <View />
      </main>
    </>
  );
}
