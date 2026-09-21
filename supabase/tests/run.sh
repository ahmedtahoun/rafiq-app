#!/usr/bin/env bash
#
# Applies supabase/migrations/0001_init.sql to a throwaway Postgres and asserts
# that the RLS policies and constraints actually behave. No Supabase project
# and no network needed — 00_supabase_shim.sql stands in for the auth schema
# and roles a real project provides.
#
#   supabase/tests/run.sh                                # spins up its own cluster
#   DATABASE_URL=postgres://... supabase/tests/run.sh     # uses an existing server (CI)
#
# Exits non-zero if any assertion fails, so it is usable as a gate.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGROOT="${PGROOT:-/var/tmp/rafiq-pgtest}"
MIN_ASSERTIONS=40

OUT=""
OWN_CLUSTER=""

# initdb refuses to run as root; hand the cluster to the postgres user instead.
run() {
  if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

# One trap, doing both jobs — a second `trap ... EXIT` would silently replace
# the first and leave the cluster running.
cleanup() {
  [ -n "$OUT" ] && rm -f "$OUT"
  [ -n "$OWN_CLUSTER" ] && run "$PGBIN/pg_ctl -D $PGROOT/pgdata stop" >/dev/null 2>&1
  return 0
}
trap cleanup EXIT

if [ -n "${DATABASE_URL:-}" ]; then
  CONN="$DATABASE_URL"
else
  command -v "$PGBIN/initdb" >/dev/null 2>&1 || {
    echo "No DATABASE_URL, and no Postgres server binaries at $PGBIN." >&2
    echo "Install postgresql-16, set PGBIN, or point DATABASE_URL at a server." >&2
    exit 2
  }
  rm -rf "$PGROOT"
  mkdir -p "$PGROOT/pgdata" "$PGROOT/sock"
  if [ "$(id -u)" = 0 ]; then
    chown -R postgres "$PGROOT"
    chmod 755 "$PGROOT" "$PGROOT/sock"
  fi

  run "$PGBIN/initdb -D $PGROOT/pgdata -U postgres --auth=trust" > "$PGROOT/initdb.log" 2>&1
  run "$PGBIN/pg_ctl -D $PGROOT/pgdata -o \"-k $PGROOT/sock -c listen_addresses=''\" -l $PGROOT/pg.log start"
  OWN_CLUSTER=1
  sleep 2

  psql -h "$PGROOT/sock" -U postgres -q -c "drop database if exists rafiq;" -c "create database rafiq;"
  CONN="postgresql://postgres@/rafiq?host=$PGROOT/sock"
fi

apply() { psql "$CONN" -v ON_ERROR_STOP=1 -q -f "$1"; }

apply "$HERE/00_supabase_shim.sql"
apply "$HERE/../migrations/0001_init.sql"
echo "migration applied cleanly"
apply "$HERE/01_fixtures.sql"
echo "fixtures loaded"

OUT="$(mktemp)"
{
  echo
  echo "=== RLS ==="
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$HERE/02_rls.sql"
  echo
  echo "=== CONSTRAINTS ==="
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$HERE/03_constraints.sql"
} | grep -v '^$' | tee "$OUT"

PASSED="$(grep -c '^PASS' "$OUT" || true)"
FAILED="$(grep -c '^FAIL' "$OUT" || true)"

echo
echo "$PASSED passed, $FAILED failed"

if [ "$FAILED" -gt 0 ]; then
  echo "SCHEMA TESTS FAILED" >&2
  exit 1
fi
# A suite that quietly stopped asserting is a failure too — without this, a
# test file that failed to load would read as a clean run.
if [ "$PASSED" -lt "$MIN_ASSERTIONS" ]; then
  echo "Expected at least $MIN_ASSERTIONS assertions, saw $PASSED — did a test file fail to run?" >&2
  exit 1
fi
