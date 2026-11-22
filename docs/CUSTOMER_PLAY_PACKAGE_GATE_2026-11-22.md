# Customer Play package gate — 2026-11-22

## Verified source state
- Documented intended Play ID: `com.debtledgeriq.sijili` (product instructions and `docs/GOOGLE_PLAY_SUBMISSION_2026.md`).
- Actual `apps/customer/app.json` Android package: `com.debtledgeriq.sijili.customer`.
- `scripts/verify-eas-config.cjs` currently asserts the latter as a Play Console draft. **These sources conflict.**
- EAS owner is `hassanali22`; project ID `3fe77bf8-4c73-471c-bebc-810aa40d51bc`.
- Remote Desktop Commander device `36hassan` was offline during this review. No live EAS build, Supabase RLS execution, SMS, or Play Console update was performed.

## Change and test
Added `scripts/check-play-package.cjs`, a fail-closed check against the documented product-owner ID. Execute `node scripts/check-play-package.cjs` before any customer Play AAB build.

Tested with Node.js v22.16.0 against two isolated JSON fixtures:
- Current configured package `com.debtledgeriq.sijili.customer`: exit 1 (blocked), as intended.
- Documented package `com.debtledgeriq.sijili`: exit 0 (pass), as intended.

This is a fixture test of the release guard, **not** a device test or proof of Play Console ownership.

## Required human verification before modifying app ID
Open the **correct** Play Console account (`hassanali941996@gmail.com`, Chrome Profile 1) and inspect the customer app's immutable package ID. If an app listing already exists under `com.debtledgeriq.sijili.customer`, do **not** rename it based only on the spec. Reconcile the intended ID and listing, update documentation and the guard after verification. If the listing is under `com.debtledgeriq.sijili`, change `app.json` and existing assertion together, then rerun typecheck and build validation.

No release, payment, customer notification, or Data Safety declaration was submitted.
