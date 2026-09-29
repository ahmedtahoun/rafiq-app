#!/usr/bin/env bash
#
# accept_session_request() under concurrency — the one thing 13_accept_flow.sql
# can't show from a single connection. Two members ask coach C for
# overlapping slots, and the coach accepts both at the same moment from two
# connections. The first holds its transaction open; the second must wait
# for it and then be refused as an overlap (23P01). Without 0010's per-coach
# advisory lock, the second's overlap check runs before the first's booking
# is visible, and both are booked.
#
#   14_accept_race.sh <connection string>     (run.sh passes its own)
set -euo pipefail
CONN="$1"

COACH_C='55555555-5555-5555-5555-555555555555'
MEMBER_R='77777777-0000-0000-0000-000000000014'
MEMBER_S='77777777-0000-0000-0000-000000000015'
REQ_R='dddddddd-0000-0000-0000-000000000014'
REQ_S='dddddddd-0000-0000-0000-000000000015'

# As the owner: two new members and a request each, ten minutes apart, on a
# day no other test books.
psql "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
  ('$MEMBER_R', 'memberR@x.com', '{"role":"client","full_name":"Member R"}'),
  ('$MEMBER_S', 'memberS@x.com', '{"role":"client","full_name":"Member S"}');
insert into public.session_requests (id, member_id, coach_id, requested_start, price) values
  ('$REQ_R', '$MEMBER_R', '$COACH_C', date_trunc('hour', now()) + interval '9 days', 0),
  ('$REQ_S', '$MEMBER_S', '$COACH_C', date_trunc('hour', now()) + interval '9 days 10 minutes', 0);
SQL

# The first accept, as coach C, holding its transaction open for 3 seconds.
psql "$CONN" -v ON_ERROR_STOP=1 -q -o /dev/null <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$COACH_C', true);
select public.accept_session_request('$REQ_R');
select pg_sleep(3);
commit;
SQL
FIRST=$!

sleep 1

# The second, while the first is still open. Prints the outcome as one word.
SECOND="$(psql "$CONN" -v ON_ERROR_STOP=1 -q -t -A <<SQL
create function pg_temp.try_accept(p uuid) returns text language plpgsql as \$\$
begin
  perform public.accept_session_request(p);
  return 'ACCEPTED';
exception when others then
  return 'DENIED(' || sqlstate || ')';
end;
\$\$;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$COACH_C', true) \\g /dev/null
select pg_temp.try_accept('$REQ_S');
commit;
SQL
)"

wait "$FIRST"

BOOKED="$(psql "$CONN" -v ON_ERROR_STOP=1 -q -t -A -c "select count(*) from public.time_blocks b join public.clients c on c.id = b.client_id where b.coach_id = '$COACH_C' and b.kind = 'booked' and c.member_id in ('$MEMBER_R', '$MEMBER_S')")"

check() {
  if [ "$2" = "$3" ]; then printf 'PASS  %-44s expected=%-14s actual=%s\n' "$1" "$3" "$2"
  else printf 'FAIL  %-44s expected=%-14s actual=%s\n' "$1" "$3" "$2"; fi
}
check 'race: second overlapping accept is refused' "$SECOND" 'DENIED(23P01)'
check 'race: one booking, not two' "$BOOKED" '1'
