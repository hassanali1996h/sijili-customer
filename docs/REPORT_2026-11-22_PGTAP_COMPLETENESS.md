# pgTAP truncated-output guard — 2026-11-22

## Change
Updated `supabase/tests/run-local-only.sh` to require exactly one TAP plan and sequential `ok N` assertions matching the plan. Previously a truncated stream such as `1..2\nok 1` could pass. Existing `not ok` rejection and local-only database restriction remain.

## Verification
Ran the same awk assertion-count logic in an isolated shell with four synthetic TAP cases: complete plan (exit 0), truncated stream (exit 1), skipped numbering (exit 1), and extra assertion (exit 1). This is a parser smoke test, **not** execution of the full runner or database integration tests.

## Still blocked
Actual pgTAP suites on disposable PostgreSQL; Supabase RLS cross-account tests; real Iraqi OTP; device-based approval/dispute flows; account deletion retention/legal review; signed EAS AAB; Play Console and Data Safety verification. No production database, subscription, messaging, or store release changes were made.
