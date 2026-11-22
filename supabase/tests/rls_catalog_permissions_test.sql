-- Catalog-level permission guardrails for a disposable Supabase test database.
-- This test does not insert user data or modify permissions.
-- Run via supabase test db; do not use as proof of live production RLS isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Every table containing user or ledger information must have RLS enabled.
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'profiles' and c.relkind in ('r','p')),
  'RLS enabled on public.profiles'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'businesses' and c.relkind in ('r','p')),
  'RLS enabled on public.businesses'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'merchant_entitlements' and c.relkind in ('r','p')),
  'RLS enabled on public.merchant_entitlements'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'customer_links' and c.relkind in ('r','p')),
  'RLS enabled on public.customer_links'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'ledger_transactions' and c.relkind in ('r','p')),
  'RLS enabled on public.ledger_transactions'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'transaction_events' and c.relkind in ('r','p')),
  'RLS enabled on public.transaction_events'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'device_installations' and c.relkind in ('r','p')),
  'RLS enabled on public.device_installations'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'push_tokens' and c.relkind in ('r','p')),
  'RLS enabled on public.push_tokens'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'notification_outbox' and c.relkind in ('r','p')),
  'RLS enabled on public.notification_outbox'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'store_webhook_events' and c.relkind in ('r','p')),
  'RLS enabled on public.store_webhook_events'
);

-- Money and sensitive infrastructure tables are never writable or readable directly
-- by client roles except through explicitly authorized RPCs and policies.
select ok(
  not has_table_privilege('authenticated', 'public.ledger_transactions', 'INSERT'),
  'authenticated role lacks direct INSERT on public.ledger_transactions'
);
select ok(
  not has_table_privilege('authenticated', 'public.ledger_transactions', 'UPDATE'),
  'authenticated role lacks direct UPDATE on public.ledger_transactions'
);
select ok(
  not has_table_privilege('authenticated', 'public.ledger_transactions', 'DELETE'),
  'authenticated role lacks direct DELETE on public.ledger_transactions'
);
select ok(
  not has_table_privilege('authenticated', 'public.transaction_events', 'INSERT'),
  'authenticated role lacks direct INSERT on public.transaction_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.transaction_events', 'UPDATE'),
  'authenticated role lacks direct UPDATE on public.transaction_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.transaction_events', 'DELETE'),
  'authenticated role lacks direct DELETE on public.transaction_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.merchant_entitlements', 'UPDATE'),
  'authenticated role lacks direct UPDATE on public.merchant_entitlements'
);
select ok(
  not has_table_privilege('authenticated', 'public.store_webhook_events', 'INSERT'),
  'authenticated role lacks direct INSERT on public.store_webhook_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT'),
  'authenticated role lacks direct SELECT on public.notification_outbox'
);
select ok(
  not has_table_privilege('authenticated', 'public.push_tokens', 'SELECT'),
  'authenticated role lacks direct SELECT on public.push_tokens'
);
select * from finish();
rollback;
