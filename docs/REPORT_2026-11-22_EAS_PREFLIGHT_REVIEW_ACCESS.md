# EAS preflight and reviewer access audit — 2026-11-22

## Verified on device 36hassan
- Connected to authenticated Expo CLI account `hassanali22`.
- Initial `eas project:info --non-interactive` failed because the local Expo slug did not match the already-linked EAS project.
- Restored the existing project's canonical slug without changing its project ID or creating a duplicate project.
- Prior `preview-connected` Android builds (2026-11-19) ended with errors during dependency installation. Their precise root cause has **not** been established from the available logs. Older demo `preview` APKs succeeded; these are not proof of connected or store-ready builds.
- Added `scripts/verify-eas-config.cjs` and a CI step. The script checks owner, slug, EAS project ID, Play Console Android package, and the preview / store Android build profile boundaries.
- Successfully ran `node scripts/verify-eas-config.cjs`, `node scripts/test-phone.cjs` (22 assertions), `npm run typecheck`, and `git diff --check` locally.
- No new AAB build, Google Play upload, live purchase, or production database write was performed.

## Google Play reviewer access — pending verification
- The owner supplied information about a reusable reviewer code in chat. **No code or credentials are stored in this repository**, and its validity was not tested.
- The application is designed for phone OTP, not email-password login. The reviewer must have a dedicated, isolated test account with a fully tested login and representative non-sensitive data.
- Do not implement a universal OTP bypass or a hardcoded fixed code in client code. Configure a deliberately scoped review flow with backend controls only after verification. Supabase's fixed-number testing feature is sensitive and should not be enabled broadly in production.
- Google Play requires durable, reusable reviewer access. Complete and validate the App access instructions inside the **correct** Play Console account; do not mark this complete from a provided code alone.

## Release gates still open
- Verify EAS production environment values (Supabase public URL and publishable key; merchant RevenueCat platform public key) without exposing secrets.
- Check Android signing credentials, version code, target SDK, and merged permissions from a real AAB.
- Validate Iraqi phone OTP, cross-account RLS, ledger approval/dispute, and account deletion on isolated test accounts.
- Verify RevenueCat service account, actual Play subscriptions and purchase / restore / expiry synchronization for merchant only.
- Confirm policy URLs, legal publisher/retention statements, and Data Safety against the tested binary.
- Do not publish or activate billing before these are proven.

## References
- https://support.google.com/googleplay/android-developer/answer/15748846
- https://supabase.com/docs/guides/auth/testing-auth-flows
- https://docs.expo.dev/submit/android/

Customer app: Android package `com.debtledgeriq.sijili.customer`; EAS slug `debt-ledger-customer`; EAS project `3fe77bf8-4c73-471c-bebc-810aa40d51bc`. Customer is free and has no purchase UI.
