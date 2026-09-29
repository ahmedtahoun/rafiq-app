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
