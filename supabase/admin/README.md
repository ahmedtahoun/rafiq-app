# Admin queues, until there is an admin panel

For closed testing, Rafiq's queues are worked from the Supabase dashboard:
**SQL Editor → New query**, paste one of these, and save it under the name
given. The SQL Editor runs as the project owner, so it sees every row — keep
the dashboard login to the people who work these queues.

Reports and deletions have deadlines. Deletions: **30 days** (the public
deletion page promises it). Reports: Apple expects "timely" action on
reports between users; aim for **24 hours**.

## Open reports

Save as **Open reports**:

```sql
select r.id, r.created_at, r.reason, r.details,
       rep.full_name as reporter, coach.full_name as coach, r.coach_id
from public.pro_reports r
left join public.profiles rep   on rep.id   = r.reporter_id
left join public.profiles coach on coach.id = r.coach_id
where r.status = 'open'
order by r.created_at;
```

To act on one (replace the ids):

```sql
-- Suspend the coach: out of Discover at once (coach_directory only lists
-- active accounts). Undo with account_status = 'active'.
update public.profiles set account_status = 'suspended' where id = '<coach_id>';

-- Close the report either way, saying what was done.
update public.pro_reports
set status = 'actioned',            -- or 'dismissed'
    resolution_note = 'Suspended after review', resolved_at = now()
where id = '<report_id>';
```

## Pending verifications

Save as **Pending verifications**:

```sql
select v.id, v.submitted_at, p.full_name, p.email, cp.title, cp.certifications, v.note, v.coach_id
from public.verification_requests v
join public.profiles p        on p.id = v.coach_id
join public.coach_profiles cp on cp.profile_id = v.coach_id
where v.status = 'pending'
order by v.submitted_at;
```

Approve or reject — the coach's badge follows automatically
(`sync_verification_status`, 0005):

```sql
update public.verification_requests
set status = 'approved',            -- or 'rejected'
    reviewer_note = 'Checked certificate', reviewed_at = now()
where id = '<request_id>';
```

## Pending account deletions

Save as **Pending deletions**:

```sql
select d.id, d.requested_at, now() - d.requested_at as waiting,
       p.full_name, p.email, p.role
from public.account_deletion_requests d
left join public.profiles p on p.id = d.profile_id
where d.status = 'pending'
order by d.requested_at;
```

**Don't carry these out in SQL.** Deleting the login and the photos needs
the Auth and Storage APIs, so it goes through the `account-deletion` Edge
Function (migration `0012` says what it deletes and keeps). From a browser
where you're signed in to the app as an admin (`admin_users`), open the
console and run:

```js
const token = JSON.parse(localStorage.getItem('sb-muikkxccdamtejvheepx-auth-token')).access_token;
const call = (body) => fetch('https://muikkxccdamtejvheepx.supabase.co/functions/v1/account-deletion', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

await call({ action: 'list' });
await call({ action: 'process', request_id: '<request_id>' });
```

A `409` with `still open: …` means the person has an upcoming session,
unused credits, an open dispute or a payout in flight. Settle it with them
first; the request stays pending. Then email them from
`support@rafiqpro.com` that it's done — the page promises that too.

## Coach plans (Rafiq Pro)

The free plan holds 3 active members (`0020`). Until In-App Purchase and
Play Billing are built, a coach who pays by Paymob link (the founding-coach
offer) is put on Pro here. The app cannot change its own plan: only this
dashboard, and later the billing webhook, writes `subscriptions`.

Save as **Coach plans**:

```sql
select p.full_name, p.email, s.tier, s.renews_at,
       (select count(*) from public.clients c where c.coach_id = cp.profile_id and c.active) as active_members
from public.coach_profiles cp
join public.profiles p on p.id = cp.profile_id
left join public.subscriptions s on s.coach_id = cp.profile_id
order by p.full_name;
```

To put a coach on Pro (replace the email, and the date they paid up to):

```sql
insert into public.subscriptions (coach_id, tier, renews_at)
select id, 'pro', '2026-11-01 00:00+02' from public.profiles where email = 'coach@example.com'
on conflict (coach_id) do update set tier = 'pro', renews_at = excluded.renews_at;
```

`renews_at` is when Pro ends unless they pay again. After it passes, the coach
is on the free plan: they keep every member they have, but can't add a
4th active one until they renew or archive down to 2. Use `null` for Pro with
no end date, for example a coach you have agreed a free year with, and
remember to set a date later.

To take a coach off Pro now: `update public.subscriptions set tier = 'free',
renews_at = null where coach_id = '…';`

## Review accounts

Apple's and Google's reviewers sign in with the two Google accounts made for
review (`store/review-notes.md` §1). Signed in, every screen shows that
account's own rows, so `review-accounts.sql` gives the pair data to show: the
coach's profile, hours and two offerings, and the member on their roster with
a goal, two attended sessions (one rated), one in three days at 17:00 Cairo,
a package, a program half done, three tasks, a message thread, a payment and
mood check-ins. Times are counted from the day it runs.

Run it **before each submission**, and again after review: it deletes
everything between the two accounts and rebuilds it, so whatever a reviewer
did (blocked, reported, archived, asked for deletion) is undone.

1. Both accounts sign in once in the app: the coach picks "I'm a Pro" and
   finishes onboarding, the member picks "I'm a Member".
2. SQL Editor → New query → paste all of `supabase/admin/review-accounts.sql`
   → put the two emails in its last statement → Run. Save it as **Reset review
   accounts**. It answers with the next session's time.

It only ever touches rows between those two accounts: never the review
member's requests to, or reports of, another coach. It refuses, changing
nothing, if an email doesn't contain "review" or names no account, if the
coach hasn't onboarded, or if anyone but the review member is on the review
coach's roster, has asked them for a session, or has reported them. A
report is moderation evidence, so a reset never erases one, and stays
refused while it exists. Any of these means real members could reach the
review coach: see "Discover" below. `supabase/tests/26_review_accounts.sql`
runs it against the real schema and policies.

**Discover lists the review coach.** `coach_directory` shows every active
coach who finished onboarding, so on the live project real members would see
"Review Coach" (with its seeded 5-star review) and could book or report
them. The script refuses to reset once a real member is on that roster, has
asked them for a session or has reported them, so nothing of theirs is
erased, but they shouldn't be able to get there.
Suspending the coach between reviews (`account_status = 'suspended'`) hides
them, but it also stops their messages and takes them off the review
member's own coach page, so it has to be lifted for every review, and they
are listed again while it is. The fix that holds is an `unlisted` flag on
`coach_profiles`, set only from here, which `coach_directory` respects for
everyone but the coach's own members and the coach. That is a migration, not
this script.
