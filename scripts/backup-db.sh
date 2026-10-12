#!/usr/bin/env bash
# A weekly backup of the live database, encrypted, on this computer.
#
#   npm run backup-db                 # into ~/RafiqBackups
#   npm run backup-db -- /some/dir    # somewhere else (never inside the repo)
#
# Why it exists: the project is on Supabase's free plan (LAUNCH-CHECKLIST §5),
# which keeps no backups. This is the only copy if the database is lost.
#
# What it saves: the roles, the schema and every row (auth users and storage
# metadata included), as Supabase's own backup guide does it. Not the photo
# files themselves: those live in Storage, not in the database.
#
# What it promises: backups older than KEEP_DAYS are deleted each time it
# runs, and the deletion page and LEGAL-DRAFTS clause 8 tell members that a
# deleted account can stay in a backup for up to four weeks. Run it every
# week, or that promise stops being true.
#
# The passphrase: openssl asks for it twice and nothing stores it. Keep it in
# the password manager. Without it a backup can't be opened, by anyone.
#
# To restore, see supabase/README.md, "Backups".
set -euo pipefail

KEEP_DAYS=28
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$HOME/RafiqBackups}"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
case "$OUT/" in
  "$REPO"/*) rmdir "$OUT" 2>/dev/null || true
             echo "Refusing to write a backup inside the repo ($OUT)." >&2; exit 1 ;;
esac
chmod 700 "$OUT"

umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

STAMP="$(date +%Y-%m-%d-%H%M)"
NAME="rafiq-db-$STAMP"
mkdir "$WORK/$NAME"

echo "Dumping the linked project (the CLI may ask for the database password)…"
cd "$REPO"
npx supabase db dump --linked --role-only -f "$WORK/$NAME/roles.sql"
npx supabase db dump --linked -f "$WORK/$NAME/schema.sql"
npx supabase db dump --linked --data-only --use-copy -f "$WORK/$NAME/data.sql"

# A dump that came back empty is a failed backup, not a small one.
if [ ! -s "$WORK/$NAME/schema.sql" ] || [ ! -s "$WORK/$NAME/data.sql" ]; then
  echo "The dump is empty; nothing was saved." >&2
  exit 1
fi

echo "Encrypting. Choose the passphrase from the password manager:"
tar -C "$WORK" -czf - "$NAME" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -out "$OUT/$NAME.tar.gz.enc"
chmod 600 "$OUT/$NAME.tar.gz.enc"
echo "Saved $OUT/$NAME.tar.gz.enc"

# Retention: anything older than KEEP_DAYS goes, and this run's file never does.
find "$OUT" -maxdepth 1 -name 'rafiq-db-*.tar.gz.enc' -mtime +"$KEEP_DAYS" -print -delete \
  | sed 's/^/Deleted (older than '"$KEEP_DAYS"' days): /'

echo "Backups kept:"
ls -1t "$OUT"/rafiq-db-*.tar.gz.enc
