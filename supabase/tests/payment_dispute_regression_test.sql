begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Isolated synthetic fixtures. Execute only against a disposable Supabase test database.
-- The outer transaction is rolled back; do not run against production.
insert into auth.users (id, phone, phone_confirmed_at)
values
 ('86000000-0000-4000-8000-000000000001', '96475000000401', now()),
 ('86000000-0000-4000-8000-000000000002', '96475000000402', now()),
 ('86000000-0000-4000-8000-000000000003', '96475000000403', now());
insert into public.businesses (id, owner_user_id, name)
values ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000001', 'Payment Test Shop');
insert into public.merchant_entitlements (business_id, trial_started_at, trial_ends_at)
values ('86000000-0000-4000-8000-000000000010', now(), now() + interval '30 days');
insert into public.customer_links (
 id, business_id, customer_user_id, customer_phone_e164, customer_display_name,
 credit_limit_iqd, status, accepted_at
) values (
 '86000000-0000-4000-8000-000000000011',
 '86000000-0000-4000-8000-000000000010',
 '86000000-0000-4000-8000-000000000002',
 '+96475000000402', 'Payment Test Customer', 10000, 'active', now()
);

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select lives_ok(
 $$select public.create_transaction_request(
 '86000000-0000-4000-8000-000000000011', 'debt', 8000, 'test debt',
 null, '86000000-0000-4000-8000-000000000021')$$,
 'merchant can request the initial debt'
);
select throws_ok(
 $$select public.create_transaction_request(
 '86000000-0000-4000-8000-000000000011', 'payment', 1000, 'premature payment',
 null, '86000000-0000-4000-8000-000000000022')$$,
 'P0001', 'Payment request exceeds available confirmed balance',
 'pending debt cannot be paid before confirmation'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select lives_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions where idempotency_key = '86000000-0000-4000-8000-000000000021'),
 'approve', '86000000-0000-4000-8000-000000000023')$$,
 'customer confirms initial debt'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select lives_ok(
 $$select public.create_transaction_request(
 '86000000-0000-4000-8000-000000000011', 'payment', 5000, 'partial payment',
 null, '86000000-0000-4000-8000-000000000024')$$,
 'merchant can request a partial payment against confirmed debt'
);
select throws_ok(
 $$select public.create_transaction_request(
 '86000000-0000-4000-8000-000000000011', 'payment', 4000, 'second pending payment',
 null, '86000000-0000-4000-8000-000000000025')$$,
 'P0001', 'Payment request exceeds available confirmed balance',
 'pending payments reserve balance and prevent overpayment'
);
select is(
 (select status::text from public.ledger_transactions
  where idempotency_key = '86000000-0000-4000-8000-000000000024'),
 'pending', 'payment request does not immediately reduce confirmed balance'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';
select throws_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions where idempotency_key = '86000000-0000-4000-8000-000000000024'),
 'dispute', '86000000-0000-4000-8000-000000000026')$$,
 'P0001', 'Transaction not found or not authorized',
 'unrelated user cannot dispute a payment'
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select lives_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions where idempotency_key = '86000000-0000-4000-8000-000000000024'),
 'dispute', '86000000-0000-4000-8000-000000000027')$$,
 'linked customer can dispute a pending payment'
);
select is(
 (select status::text from public.ledger_transactions
  where idempotency_key = '86000000-0000-4000-8000-000000000024'),
 'disputed', 'disputed payment remains separate from confirmed balance'
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select lives_ok(
 $$select public.create_transaction_request(
 '86000000-0000-4000-8000-000000000011', 'payment', 8000, 'retry after dispute',
 null, '86000000-0000-4000-8000-000000000028')$$,
 'disputed payment releases the reserved balance for a fresh request'
);
select * from finish();
rollback;
