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
for file in "${tests[@]}"; do
  echo "Running $(basename "$file") on local disposable database"
  psql "$LEDGER_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file"
done
echo "SQL scripts completed. Inspect TAP assertions for not ok failures."
