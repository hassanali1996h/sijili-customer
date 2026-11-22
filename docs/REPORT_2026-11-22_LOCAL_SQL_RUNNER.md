# SQL regression runner round — 2026-11-22

## Changes
Added `supabase/tests/run-local-only.sh` to both repositories. The runner refuses absent, malformed or non-loopback database URLs, requires an explicit local PostgreSQL URL with port and database, and invokes all `*_test.sql` suites with `psql -X -v ON_ERROR_STOP=1`. It is intended for a disposable, locally migrated Supabase database, not production.

## Review
Reviewed AGENTS.md, KNOWN_GAPS.md, RELEASE_CHECKLIST.md, GOOGLE_PLAY_SUBMISSION_2026.md and the latest commits in both repositories. Supabase project `debt-ledger-staging` is active, but was not used as a disposable target. Remote device 36hassan was offline.

## Verification and limitations
The files were committed through GitHub. No PostgreSQL test execution, bash syntax check on the remote machine, EAS build, OTP delivery, Play Console edit, payment, or production mutation was performed. `psql` returning zero does not by itself prove pgTAP assertions passed; inspect TAP output and fail on any `not ok` before accepting results.

## Next
Provision an isolated local Supabase instance, run migrations and tests, capture TAP output and fix failures. Add concurrency and two-user isolation tests; verify hosted privacy and deletion pages and publisher declarations before store submission.
