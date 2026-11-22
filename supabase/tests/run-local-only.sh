#!/usr/bin/env bash
# Run ledger pgTAP suites only against a local disposable PostgreSQL instance.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -z "${LEDGER_TEST_DATABASE_URL:-}" ]]; then
  echo "Set LEDGER_TEST_DATABASE_URL to a disposable local database URL." >&2
  exit 2
fi
if [[ ! "${LEDGER_TEST_DATABASE_URL}" =~ ^postgres(ql)?:// ]]; then
  echo "Expected a postgres:// or postgresql:// URL." >&2
  exit 2
fi
# Reject cloud hosts, DNS aliases, IPv6, Unix sockets and remote endpoints.
# Explicitly permit only IPv4 loopback and localhost with a port.
if [[ ! "${LEDGER_TEST_DATABASE_URL}" =~ ^postgres(ql)?://([^/@]+@)?(localhost|127\.0\.0\.1):[0-9]+/[^/?#]+([?#].*)?$ ]]; then
  echo "Refusing non-local or unqualified database URL." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 2
fi
shopt -s nullglob
tests=("$ROOT"/supabase/tests/*_test.sql)
if (( ${#tests[@]} == 0 )); then
  echo "No SQL test files found." >&2
  exit 2
fi
# psql exits successfully even when pgTAP emits "not ok"; fail on TAP failures.
# Use unaligned tuples-only output to make TAP assertion lines machine-readable.
for file in "${tests[@]}"; do
  echo "Running $(basename "$file") on local disposable database"
  output="$(mktemp)"
  if ! psql "$LEDGER_TEST_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f "$file" >"$output" 2>&1; then
    cat "$output"
    rm -f "$output"
    echo "SQL execution failed: $(basename "$file")" >&2
    exit 1
  fi
  cat "$output"
  if grep -Eq '^[[:space:]]*not ok[[:space:]]+[0-9]+' "$output"; then
    rm -f "$output"
    echo "pgTAP assertion failed: $(basename "$file")" >&2
    exit 1
  fi
  # Reject truncated TAP output: require a single plan and all numbered assertions.
  if ! awk '
    /^[[:space:]]*1\\.\\.[0-9]+[[:space:]]*$/ {
      if (++plans != 1) bad = 1
      split($1, parts, /\\.\\./)
      expected = parts[2] + 0
      if (expected < 1) bad = 1
      next
    }
    /^[[:space:]]*ok[[:space:]]+[0-9]+([[:space:]]|$)/ {
      seen++
      if ($2 + 0 != seen) bad = 1
      next
    }
    END { if (bad || plans != 1 || seen != expected) exit 1 }
  ' "$output"; then
    rm -f "$output"
    echo "Incomplete or inconsistent pgTAP assertion count: $(basename "$file")" >&2
    exit 1
  fi
  rm -f "$output"
done
echo "All SQL scripts completed without reported pgTAP failures."
