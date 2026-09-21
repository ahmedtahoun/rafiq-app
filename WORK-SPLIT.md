# Work split — three parallel tracks

Three accounts are building this repo at once. Everything past the 7 ported
screens is divided below so the three of us rarely touch the same lines.

The screen inventory here was reconstructed from the code's own
`TODO: route to ...` comments and the `comingSoon` stubs, not from the Rafiq
Build Plan doc (which lives outside this repo). Where the two disagree, the
Build Plan doc wins — reconcile and update this file. Track A/B naming follows
the convention already used in `src/components/BottomNav.tsx`.

## The tracks

| | Track A — Coach (Pro) | Track B — Client (Member) | Track C — Auth & cross-role |
|---|---|---|---|
| **Already built** | Main, Profile, EditProfile, AccountDetails, Onboarding (coach) | nothing — RoleSelect dead-ends at `ComingSoon` | nothing — Supabase scaffolded, not connected |
| **Owns** | Schedule, Clients, ClientDetail, AddClient, AddTask, AddTimeBlock, SessionRoom, Earnings, Offerings, SessionTemplates, Availability, PreviewProfile, ShareProfile | ClientOnboarding, ClientHome, Discover, RateCoach, client-side Subscription, client-side Schedule/Messages views | Auth, Notifications, Subscription (coach), HelpCenter, PrivacyPolicy, TermsOfService, MessagesInbox, Messages |
| **Owns in shared files** | coach half of `mockStore.ts`, coach screens' i18n keys | client half of `mockStore.ts`, client screens' i18n keys | Supabase client, auth/session state in `appStore.ts`, legal + shared i18n keys |

Messaging (`MessagesInbox`, `Messages`, and `getUnreadMessageCount`'s
`forRole` seam) serves both roles, so it sits with Track C rather than being
built twice. `Subscription` is split: Track C ports the coach-side screen,
Track B ports the member-side view once C's lands.

## Order of work

Ordering is by fan-in — how many existing stubs route into a screen today
(`grep -rn "TODO: route to" src`). Building the high-fan-in screens first
deletes the most placeholders and unblocks the most other work.

**Wave 1 — unblock everything else**

- **A: Schedule (4 refs) → Clients (3 refs) → ClientDetail.** Highest fan-in in
  the repo. `Clients` is also the roster fallback `QuickActions` sends every
  unscoped action to, so porting it makes the whole FAB live.
- **B: ClientOnboarding → ClientHome.** The entire client half of the app is
  unreachable until these exist; `BottomNav` was already built to take its tab
  list as a prop for exactly this. Biggest unblock on the board.
- **C: Auth (2 refs) + connect Supabase.** Everything is `localStorage` today.
  The longer real auth waits, the more screens get written against a store
  shape that has to change.

**Wave 2**

- **A:** AddTimeBlock (3 refs), AddClient, AddTask, SessionRoom.
- **B:** Discover, RateCoach, member-side Subscription.
- **C:** MessagesInbox (3 refs) + Messages, Notifications, Subscription (coach).

**Wave 3**

- **A:** Earnings (2 refs), Offerings, SessionTemplates, Availability,
  PreviewProfile, ShareProfile.
- **B:** remaining client screens from the Build Plan doc.
- **C:** HelpCenter, PrivacyPolicy, TermsOfService; replace the `mockStore`
  seams with real Supabase reads.

## Shared files — the collision points

Screens are one `.tsx` + one `.css` each, so those never collide. These four
files do, because every new screen touches them:

| File | What every track adds | Rule |
|---|---|---|
| `src/lib/i18n.ts` | per-screen keys in both `en` and `ar` | Append inside your track's region, never re-sort the dict. Keys stay screen-prefixed (`mainX`, `profileX`, `qaX`). |
| `src/store/appStore.ts` | `Screen` union members, `ROOTS`/`NOHIST`/`PARENT` entries | Each track gets its own line in the union and its own entries block — don't reflow the others'. |
| `src/App.tsx` | one `case` per screen | Cases grouped by track; add yours to your group only. |
| `src/lib/mockStore.ts` | data seams for your screens | Coach and client sections are separate; add to yours. If it gets unwieldy, split into `mockStore.coach.ts` / `mockStore.client.ts` rather than interleaving. |

Region banner comments to make those rules enforceable aren't in the files
yet — worth adding in one pass before Wave 1 starts, while the tree is quiet.

## Merge protocol

All three accounts currently push straight to `main` with no PRs, which is
workable at this size as long as:

1. **One track per session.** Don't pick up another track's screen mid-session —
   that's what produces the shared-file conflicts.
2. **`git pull --rebase origin main` before every push.** Two merge commits in
   the history already came from skipping this.
3. **`npm run build && npm run lint` must pass before pushing.** Both are clean
   today (`tsc -b` strict, oxlint 0 findings) — keep them that way so a red
   tree is always the last push, never someone else's. CI
   (`.github/workflows/ci.yml`) runs the same checks plus the schema suite on
   every branch, so this is now enforced rather than agreed — but finding out
   locally is still faster than finding out from a red badge.
4. **Delete the stub you replaced.** When a screen lands, remove its
   `comingSoon` route and its `TODO: route to ...` comment in the same commit,
   so the grep above stays an accurate to-do list.
