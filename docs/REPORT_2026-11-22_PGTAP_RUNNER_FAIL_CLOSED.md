# 2026-11-22 — pgTAP runner fail-closed update

## Scope
Both repositories: `supabase/tests/run-local-only.sh`.

## Finding
The previous runner used `psql -v ON_ERROR_STOP=1` but pgTAP assertion failures can be printed as `not ok N` while SQL exits successfully. Thus a green shell exit did not prove the assertions passed.

## Change
- Use `psql -X -A -t` to produce parseable TAP rows.
- Reject `not ok N` and missing TAP plan / passing assertion rows, as well as SQL execution errors.
- Keep loopback-only database URL guard. No staging/production writes.

## Validation and limits
- GitHub committed the same script blob to both repositories.
- Actual pgTAP execution on isolated PostgreSQL is still pending. Static inspection is not a substitute for a passing database test.
- This check does not yet validate TAP plan counts or unexpected diagnostics; future hardening may use a dedicated TAP parser.
- The 36hassan device is offline; no Google Play Console or Expo EAS build was attempted.

## Next gate
Run against a disposable local database with all migrations and pgTAP installed, verify nonzero exit on an intentionally failing assertion, then investigate any RLS or ledger failures. Do not publish or claim compliance before real device and policy checks.
