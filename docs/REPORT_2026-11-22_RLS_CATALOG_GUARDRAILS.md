# Security regression round — 2026-11-22 (RLS catalog permissions)

## Verified source state
- Read AGENTS.md, docs/KNOWN_GAPS.md, docs/RELEASE_CHECKLIST.md, docs/GOOGLE_PLAY_SUBMISSION_2026.md, SECURITY.md and the baseline schema in the merchant repository; checked existing transaction/payment regression suites in both repositories.
- The latest previous report commits were fc97969 (merchant) and 3f9074c (customer). No Supabase production changes were made.

## Change
- Added identical `supabase/tests/rls_catalog_permissions_test.sql` to both repos.
- The 20 pgTAP assertions check that RLS is enabled on ten sensitive tables, and that the authenticated client role lacks ten direct permissions on ledger, events, entitlements, webhook, push token and outbox tables.
- These are schema/privilege guardrails; they do NOT prove cross-user read isolation, RPC authorization, concurrency, or actual data deletion behavior.

## Validation
- Fetched both committed files from GitHub; contents have identical blob SHA `8261902bbf2c55307b9cd4f7e3582f03e525e4e2`.
- Static checks: `plan(20)`, exactly 20 `ok()` assertions, and terminal `rollback;`.
- NOT RUN: pgTAP on disposable PostgreSQL/Supabase. The 36hassan computer is offline; no connected disposable test database was identified for execution. Do not claim a green SQL test suite.

## Next actions
1. Start an isolated Supabase test database and run all `supabase/tests/*.sql` with pgTAP; inspect and fix failing assertions.
2. Add two-merchant/two-customer RLS isolation tests and concurrent credit-limit tests using separate sessions.
3. Test Iraqi SMS OTP on actual carriers, account deletion, subscription state and signed Android AAB in internal testing.
4. Verify public policy pages, actual Data Safety responses, and legal retention wording before any store submission.

No production data, store settings, payment products, or customer communications were changed.
