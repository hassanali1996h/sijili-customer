begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- A small two-shop fixture proves isolation through the same authenticated role
-- the mobile apps use. The fixture and all assertions roll back at the end.
insert into auth.users (id, email, phone, phone_confirmed_at)
values
  ('00000000-0000-4000-8000-000000000001', 'merchant-a@example.test', '+96475000000001', now()),
  ('00000000-0000-4000-8000-000000000002', 'merchant-b@example.test', '+96475000000002', now()),
  ('00000000-0000-4000-8000-000000000003', 'customer-a@example.test', '+96475000000003', now()),
  ('00000000-0000-4000-8000-000000000004', 'customer-b@example.test', '+96475000000004', now());

insert into public.businesses (id, owner_user_id, name)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Shop A'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Shop B');

insert into public.merchant_entitlements (business_id, trial_started_at, trial_ends_at)
values
  ('10000000-0000-4000-8000-000000000001', now(), now() + interval '30 days'),
  ('10000000-0000-4000-8000-000000000002', now(), now() + interval '30 days');

insert into public.customer_links (
  id, business_id, customer_user_id, customer_phone_e164,
  customer_display_name, credit_limit_iqd, status, accepted_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '+96475000000003', 'Customer A', 100000, 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', '+96475000000004', 'Customer B', 100000, 'active', now());

insert into public.ledger_transactions (
  id, business_id, customer_link_id, created_by, kind, amount_iqd, status, idempotency_key
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'debt', 5000, 'pending', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'debt', 5000, 'pending', '40000000-0000-4000-8000-000000000002');

insert into public.transaction_events (transaction_id, actor_user_id, event_type, idempotency_key)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'created', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'created', '40000000-0000-4000-8000-000000000002');

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'profiles', 'businesses', 'merchant_entitlements', 'customer_links',
        'ledger_transactions', 'transaction_events', 'device_installations',
        'push_tokens', 'notification_outbox', 'store_webhook_events', 'account_deletion_requests'
      ])
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  'RLS is enabled on every user-data table'
);

select ok(not has_table_privilege('authenticated', 'public.ledger_transactions', 'INSERT'), 'authenticated cannot insert ledger transactions directly');
select ok(not has_table_privilege('authenticated', 'public.ledger_transactions', 'UPDATE'), 'authenticated cannot update ledger transactions directly');
select ok(not has_table_privilege('authenticated', 'public.ledger_transactions', 'DELETE'), 'authenticated cannot delete ledger transactions directly');
select ok(not has_table_privilege('authenticated', 'public.transaction_events', 'INSERT'), 'authenticated cannot insert transaction events directly');
select ok(not has_table_privilege('authenticated', 'public.transaction_events', 'UPDATE'), 'authenticated cannot update transaction events directly');
select ok(not has_table_privilege('authenticated', 'public.transaction_events', 'DELETE'), 'authenticated cannot delete transaction events directly');
select ok(not has_table_privilege('authenticated', 'public.account_deletion_requests', 'INSERT'), 'authenticated cannot insert deletion requests directly');
select ok(not has_function_privilege('anon', 'public.request_account_deletion()', 'EXECUTE'), 'anonymous cannot request deletion');

insert into public.customer_links (id, business_id, customer_phone_e164, customer_display_name)
values ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '+96475000000005', 'Invited customer');

insert into auth.users (id, phone) values ('00000000-0000-4000-8000-000000000005', '96475000000005');
select ok(not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000005'), 'unconfirmed phone has no profile');
select ok((select customer_user_id is null from public.customer_links where id = '20000000-0000-4000-8000-000000000005'), 'unconfirmed phone cannot claim invitation');

update auth.users set phone_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000005';
select is((select phone_e164 from public.profiles where id = '00000000-0000-4000-8000-000000000005'), '+96475000000005', 'OTP confirmation normalizes the phone');
select ok((select customer_user_id = '00000000-0000-4000-8000-000000000005' and status = 'invited' from public.customer_links where id = '20000000-0000-4000-8000-000000000005'), 'confirmed account receives invitation without accepting it');

set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')), 1::bigint, 'merchant reads only its own profile');
select is((select count(*) from public.businesses where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 1::bigint, 'merchant reads only its own shop');
select is((select count(*) from public.customer_links where id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')), 1::bigint, 'merchant reads only its own customer links');
select is((select count(*) from public.ledger_transactions where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')), 1::bigint, 'merchant reads only its own ledger transactions');
select is((select count(*) from public.transaction_events where transaction_id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')), 1::bigint, 'merchant reads only its own transaction events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
do $$
begin
  perform public.request_account_deletion();
  perform public.request_account_deletion();
end;
$$;
select is((select count(*) from public.account_deletion_requests), 1::bigint, 'repeated requests create only one entry');
select is((select count(*) from public.businesses where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 1::bigint, 'customer reads only a linked shop');
select is((select count(*) from public.customer_links where id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')), 1::bigint, 'customer reads only its own link');
select is((select count(*) from public.ledger_transactions where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')), 1::bigint, 'customer reads only its own ledger transactions');
select is((select count(*) from public.transaction_events where transaction_id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')), 1::bigint, 'customer reads only its own transaction events');
select is((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'customer cannot read another user profile');
select is((select count(*) from public.ledger_transactions where id = '30000000-0000-4000-8000-000000000002'), 0::bigint, 'customer cannot read another shop transaction');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
select is((select count(*) from public.account_deletion_requests), 0::bigint, 'other users cannot see the deletion request');
select is((select count(*) from public.businesses where id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'unlinked customer cannot read another shop');

select * from finish();
rollback;

