# Codex instructions — Debt Ledger

You are implementing a two-app, production-intended debt ledger for Iraq. Read all of `README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/STORE_SETUP.md`, and `docs/RELEASE_CHECKLIST.md` before changing code.

## Non-negotiable product decisions

- Two separate mobile apps: `apps/merchant` (paid by shop owner) and `apps/customer` (free for customer). Both use the same Supabase backend and shared localization package.
- Initial market: Iraq. Ledger currency: IQD. Languages: Arabic and Central Kurdish / Sorani (`ckb`). Both interfaces are RTL. User can change language in Settings; default Arabic unless device locale is Sorani.
- Sign-in is verified mobile phone number + OTP only. No email/password sign-in. Use E.164 phone numbers. SMS provider must be configured and tested for Iraqi numbers before production.
- Merchant gets exactly 30 days from first successful merchant/business activation, granted by our backend. No payment card and no store free-trial offer is requested at signup. This is NOT an auto-billing trial. At expiry, merchant switches to READ-ONLY; all old data remains viewable. No new debt/payment requests or edits until a valid store subscription is active. Customer app remains free.
- Prices requested by product owner: monthly 2,500 IQD; six months 12,500 IQD; annual 20,000 IQD. Store product display must use actual localized prices returned by Apple/Google; never hardcode an IQD price if the storefront does not offer that exact local price.
- A debt/payment record entered by the merchant is PENDING until the customer receives an in-app/push notification and chooses APPROVE or DISPUTE. The customer must not be able to silently alter the amount. A confirmed transaction is immutable; correction requires a new, separately confirmed compensating transaction. Keep original event history.
- Merchant sets an IQD credit ceiling per customer. New debt requests must be blocked if confirmed outstanding balance plus other pending debt requests plus the proposed debt would exceed the ceiling. Pending payments do not reduce outstanding balance until confirmed by customer.
- Merchant app may be bound to one active app installation at a time. Do NOT use IP address, IMEI, serial number, advertising ID, or invasive hardware fingerprint as the identity. Use a random per-installation UUID kept in SecureStore. A device transfer requires fresh OTP verification; a new device must never reset the 30-day trial. Customers are not subject to the merchant device restriction unless product owner later approves it.
- Never claim that OTP, push notification, or an in-app approval is automatically a legally enforceable electronic signature or court instrument in Iraq. Legal counsel must review the final flow and wording.

## Technical baseline

- Use the current stable Expo SDK shown by official docs at implementation time (the project was prepared against Expo SDK 58 / React Native 0.88). Do not use canary/beta packages for production.
- Expo Router, TypeScript, React Native, npm workspaces, Supabase Auth/Postgres/Edge Functions, and RevenueCat for native store subscriptions.
- Use `npx expo install` for Expo-managed native dependencies. Run `npx expo install --fix` after SDK changes.
- Keep both apps in the monorepo; shared logic and translations belong in `packages/shared`.
- Supabase RLS must be enabled on every user-data table. No client direct writes to ledger tables; all state transitions go through narrowly scoped Postgres RPCs / Edge Functions.
- Never ship Supabase service-role keys, RevenueCat secret API keys, SMS provider secrets, webhook authorization tokens, or other secrets in the apps. Use Edge Function secrets.
- Subscription state on the backend is authoritative. The client may display cached state but may not grant its own entitlement.

## Required implementation sequence

1. Inspect this starter and report gaps before coding. Confirm all decisions above are represented.
2. Finish Supabase schema, RLS policies, RPCs, and automated SQL tests first. Ensure transaction creation, approval, dispute, credit-ceiling enforcement, trial expiry, and device transfer are atomic and idempotent.
3. Implement phone OTP and profile setup in both apps. Add country-code-aware phone input and normalize to E.164.
4. Implement Arabic/Sorani localization, persistent language selection, RTL layouts, dynamic text direction, accessible labels, and no clipped Kurdish/Arabic strings.
5. Implement merchant flows: create shop, invite/add customer by phone (share an invitation if the customer has not registered), set customer ceiling, create debt request, view pending/confirmed/disputed items, customer ledger and read-only trial-expired state. Do not send debt amounts or descriptions in SMS invitations.
6. Implement customer flows: accept shop link, notifications, pending request detail, approve/dispute, and per-shop history.
7. Implement push notification outbox/dispatcher. Notifications must not reveal amounts or debt details on a locked screen by default.
8. Integrate RevenueCat on merchant app only. Configure three products and `merchant_pro` entitlement. Sync to backend by authenticated webhook and verify the purchase with RevenueCat/store. Add Restore Purchases and Manage Subscription. Do not add any purchase UI to customer app.
9. Implement account deletion and privacy controls in both apps. Preserve counterpart ledger history only as permitted by applicable law, using pseudonymization where appropriate; document exact retention periods after legal review.
10. Add tests, error handling, analytics that avoid sensitive ledger content, offline-safe read cache, crash reporting configuration, and store assets/configuration.

## Quality gates

- Do not mark a phase complete until lint/typecheck/tests pass and the changed files are listed.
- Add tests for concurrent debt requests against a ceiling, duplicate OTP submissions, duplicate webhooks, duplicate approvals, disputes, cancelled/expired subscriptions, restored purchases, account deletion, and device transfer.
- All money is integer IQD (`bigint` in Postgres; integer in app DTOs). No floating-point money math.
- All timestamps are UTC in storage; UI formats for `Asia/Baghdad`.
- Do not add marketing features, blacklists, public credit scores, cross-shop debt visibility, or other features not in the approved spec.
- If a store policy or legal question is uncertain, document the uncertainty and request human verification; do not invent compliance claims.

## First Codex task

Start by reading the docs, then produce a `docs/IMPLEMENTATION_PLAN.md` with milestones, files to change, dependencies, and acceptance tests. After that, implement Milestone 1 only. Do not try to write the whole production app in one pass.

