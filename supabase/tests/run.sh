#!/usr/bin/env bash
# Applies the migration to a throwaway Postgres and asserts the RLS policies
# and constraints actually behave. No Supabase project needed — 00_supabase_shim.sql
# stands in for the auth schema and roles a real project provides.
#
#   supabase/tests/run.sh
#
# Needs a local postgres 16 server binary (initdb/pg_ctl) and psql. Every line
# of output ends in the expected value; anything reading DENIED/REJECTED where
# a number was expected (or the reverse) is a failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGROOT="${PGROOT:-/var/tmp/rafiq-pgtest}"

rm -rf "$PGROOT"
mkdir -p "$PGROOT/pgdata" "$PGROOT/sock"

# initdb refuses to run as root; fall back to the postgres system user.
RUN=""
if [ "$(id -u)" = 0 ]; then
  chown -R postgres "$PGROOT"
  chmod 755 "$PGROOT" "$PGROOT/sock"
  RUN="su postgres -c"
fi
run() { if [ -n "$RUN" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }

run "$PGBIN/initdb -D $PGROOT/pgdata -U postgres --auth=trust" > "$PGROOT/initdb.log" 2>&1
run "$PGBIN/pg_ctl -D $PGROOT/pgdata -o \"-k $PGROOT/sock -c listen_addresses=''\" -l $PGROOT/pg.log start"
trap 'run "$PGBIN/pg_ctl -D $PGROOT/pgdata stop" >/dev/null 2>&1 || true' EXIT
sleep 2

psql -h "$PGROOT/sock" -U postgres -q -c "create database rafiq;"
PSQL=(psql -h "$PGROOT/sock" -U postgres -d rafiq -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$HERE/00_supabase_shim.sql"
"${PSQL[@]}" -f "$HERE/../migrations/0001_init.sql"
echo "migration applied cleanly"
"${PSQL[@]}" -f "$HERE/01_fixtures.sql"

echo
echo "=== RLS ==="
psql -h "$PGROOT/sock" -U postgres -d rafiq -f "$HERE/02_rls.sql" 2>&1 | grep -v '^$'
echo
echo "=== CONSTRAINTS ==="
psql -h "$PGROOT/sock" -U postgres -d rafiq -f "$HERE/03_constraints.sql" 2>&1 | grep -v '^$'
