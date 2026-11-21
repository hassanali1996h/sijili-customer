# Supabase Edge Functions

## Required secrets

Set these using `supabase secrets set` (never commit the real values):

- `REVENUECAT_WEBHOOK_AUTH`: exact bearer token configured in RevenueCat Webhook settings.
- `REVENUECAT_SECRET_API_KEY`: RevenueCat secret REST API key used server-side only.
- `NOTIFY_FUNCTION_SECRET`: strong random bearer token for the notification dispatcher.
- `EXPO_PUSH_ACCESS_TOKEN`: required when Enhanced Push Security is enabled for the Expo projects.
- Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in hosted Edge Functions.

## Deployment

```powershell
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy revenuecat-sync
supabase functions deploy notify-event --no-verify-jwt
```

`revenuecat-webhook` and `notify-event` verify their shared secrets themselves. `revenuecat-sync` requires a valid Supabase user JWT; it derives the app user ID from that verified session, then reads current subscriber status using the server-only RevenueCat secret. Configure the RevenueCat webhook URL to the deployed `revenuecat-webhook` endpoint and put the configured Authorization value in RevenueCat.

The notification dispatcher claims outbox rows with a lease and retries when no send ticket was accepted, with dead-letter handling after eight reported failures. When Expo accepts a ticket, the worker records the ticket and completes the send in the same database transaction. The existing `delivered_at` field records acceptance by Expo for new sends. Older outbox rows have no saved ticket IDs.

The worker starts checking saved receipts after 15 minutes. Missing receipts are checked again, then marked unknown after 24 hours. A successful receipt confirms handoff to Apple or Google. A failed receipt stores a provider error code for review. `DeviceNotRegistered` removes the matching registration if it has not been refreshed since the send. Receipt lookup never resends the original notification. A timeout during the original send can still produce a duplicate if Expo accepted it before the connection failed. Keep amounts, descriptions, and personal details out of lock-screen notifications.

Schedule regular calls to `notify-event` with `Authorization: Bearer <NOTIFY_FUNCTION_SECRET>`, even when no new outbox items arrive. It processes up to 100 due receipts and 25 outbox rows per call. Choose a cadence that keeps the queues current and monitor receipt failures, unknown results, and dead letters. Configure the schedule and push credentials in the deployment environment, and review the retention policy for processed rows.

Before production, verify the RevenueCat subscriber response shape against current RevenueCat docs and test all event types in Sandbox. The code intentionally checks current subscriber entitlements instead of treating an arbitrary webhook payload as the sole authority.

