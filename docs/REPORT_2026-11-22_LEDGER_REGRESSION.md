# Regression coverage: debt approval and credit ceiling — 2026-11-22

## Changes
- Added `supabase/tests/transaction_approval_regression_test.sql` (14 pgTAP assertions) in both application repositories.
- Exercises authenticated merchant creation, pending state, exact idempotency replay, changed-amount replay rejection, credit ceiling with pending debt, unrelated-user approval rejection, customer approval, repeated approval, event deduplication, and refusal to dispute a confirmed transaction.
- Uses synthetic UUIDs and phone numbers; wraps fixtures in a transaction and rolls back.
- The unauthorized-user case captures the actual transaction UUID before changing JWT identity, avoiding a false positive from RLS-filtered lookups.

## Verification
- Previously fixed GitHub Actions validation for Iraqi phone normalization and TypeScript was confirmed successful for both apps on the prior commits (merchant `7c8a87d`, customer `c0f635e`).
- New SQL test **not yet executed**: GitHub Actions `validate.yml` only runs phone tests and TypeScript; it does not run `supabase test db`. A green CI result does not validate SQL behavior.
- Run locally against a disposable Supabase instance: `npm install`, `npx supabase start`, `npx supabase db reset`, `npx supabase test db`. Inspect failures before claiming security correctness.
- Device `36hassan` was offline during this cycle; no EAS build, live OTP, Supabase production write, Google Play Console edit or subscription activation was attempted.

## Next blockers
- Run pgTAP on an isolated database, fix any discovered SQL/test defects, and test concurrent requests against one credit limit.
- Confirm provider OTP delivery in Iraq, app review access, privacy/deletion retention terms and real Android build properties.
- Never submit Data Safety declarations or release a production build without verified SDK/data flows and owner-approved legal details.
