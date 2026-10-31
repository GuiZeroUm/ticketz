#!/bin/bash
# Samples Postgres activity for N seconds and prints rates. Read-only.
#
# Usage: scripts/perf/sample-postgres.sh <container> <seconds>
#   e.g. scripts/perf/sample-postgres.sh espaco-whats-7oyzgd-postgres-1 60
#
# Prints transactions per second for the database and, per table, the reads
# per minute (sequential scans + index scans, i.e. queries touching the table),
# top 15 tables.
# Every session is forced read-only with default_transaction_read_only=on.
set -euo pipefail

if [ "$#" -ne 2 ] || ! [[ "$2" =~ ^[0-9]+$ ]] || [ "$2" -lt 1 ]; then
  echo "usage: $0 <container> <seconds>" >&2
  exit 2
fi
C=$1
SECS=$2

snap() {
  docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$C" \
    sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -F "|"' <<'SQL'
select relname, coalesce(seq_scan,0) + coalesce(idx_scan,0)
  from pg_stat_user_tables;
select '__db', xact_commit + xact_rollback from pg_stat_database
  where datname = current_database();
SQL
}

A=$(snap); TA=$(date +%s.%N)
sleep "$SECS"
B=$(snap); TB=$(date +%s.%N)

OUT=$(awk -F'|' -v dt="$(awk -v a="$TA" -v b="$TB" 'BEGIN{print b-a}')" '
  FNR == NR { a[$1] = $2; next }
  $1 == "__db" { printf "TPS %.1f\n", ($2 - a[$1]) / dt; next }
  { printf "%.0f %s\n", ($2 - a[$1]) * 60 / dt, $1 }
' <(printf '%s\n' "$A") <(printf '%s\n' "$B"))

echo "transactions/s: $(awk '$1 == "TPS" { print $2 }' <<<"$OUT")"
echo "reads per minute, by table (top 15):"
grep -v '^TPS ' <<<"$OUT" | sort -rn | head -15 | awk '{ printf "%10s  %s\n", $1, $2 }'
