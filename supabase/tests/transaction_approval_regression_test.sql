begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Synthetic two-party fixture. No production records are used; rollback restores the DB.
insert into auth.users (id, phone, phone_confirmed_at)
values
 ('85000000-0000-4000-8000-000000000001', '96475000000301', now()),
 ('85000000-0000-4000-8000-000000000002', '96475000000302', now()),
 ('85000000-0000-4000-8000-000000000003', '96475000000303', now());
insert into public.businesses (id, owner_user_id, name)
values ('85000000-0000-4000-8000-000000000010', '85000000-0000-4000-8000-000000000001', 'Fixture Shop');
insert into public.merchant_entitlements (business_id, trial_started_at, trial_ends_at)
values ('85000000-0000-4000-8000-000000000010', now(), now() + interval '30 days');
insert into public.customer_links (
 id, business_id, customer_user_id, customer_phone_e164, customer_display_name,
 credit_limit_iqd, status, accepted_at
) values (
 '85000000-0000-4000-8000-000000000011',
 '85000000-0000-4000-8000-000000000010',
 '85000000-0000-4000-8000-000000000002',
 '+96475000000302', 'Fixture Customer', 10000, 'active', now()
);

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';

select is(
 public.create_transaction_request(
  '85000000-0000-4000-8000-000000000011', 'debt', 6000, 'fixture',
  null, '85000000-0000-4000-8000-000000000021'
 ),
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'merchant creates a pending debt request'
);
select is(
 (select status::text from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'pending', 'new debt remains pending'
);
select is(
 public.create_transaction_request(
  '85000000-0000-4000-8000-000000000011', 'debt', 6000, 'fixture',
  null, '85000000-0000-4000-8000-000000000021'
 ),
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'exact replay returns the original transaction'
);
select is(
 (select count(*) from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 1::bigint, 'exact replay does not duplicate the debt'
);
select throws_ok(
 $$select public.create_transaction_request(
 '85000000-0000-4000-8000-000000000011', 'debt', 7000, 'fixture',
 null, '85000000-0000-4000-8000-000000000021')$$,
 'P0001', 'Idempotency key was already used for a different transaction',
 'changed amount with reused idempotency key is rejected'
);
select throws_ok(
 $$select public.create_transaction_request(
 '85000000-0000-4000-8000-000000000011', 'debt', 5000, 'second debt',
 null, '85000000-0000-4000-8000-000000000022')$$,
 'P0001', 'Customer credit limit would be exceeded',
 'pending debt counts toward the customer credit ceiling'
);
select is(
 (select count(*) from public.ledger_transactions
  where customer_link_id = '85000000-0000-4000-8000-000000000011'),
 1::bigint, 'rejected debt leaves the ledger unchanged'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000003';
select throws_ok(
 $select public.respond_to_transaction(
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'approve', '85000000-0000-4000-8000-000000000023')$,
 'P0001', 'Transaction not found or not authorized',
 'unrelated user cannot approve the debt'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select lives_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'approve', '85000000-0000-4000-8000-000000000023')$$,
 'linked customer can approve the pending debt'
);
select is(
 (select status::text from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'confirmed', 'customer approval confirms the debt'
);
select lives_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'approve', '85000000-0000-4000-8000-000000000023')$$,
 'identical approval replay is idempotent'
);
select is(
 (select count(*) from public.transaction_events
  where idempotency_key = '85000000-0000-4000-8000-000000000023'),
 1::bigint, 'approval replay creates only one event'
);
select throws_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'dispute', '85000000-0000-4000-8000-000000000023')$$,
 'P0001', 'Idempotency key was already used for a different decision',
 'approval key cannot be replayed as a dispute'
);
select throws_ok(
 $$select public.respond_to_transaction(
 (select id from public.ledger_transactions
  where idempotency_key = '85000000-0000-4000-8000-000000000021'),
 'dispute', '85000000-0000-4000-8000-000000000024')$$,
 'P0001', 'Transaction is no longer pending',
 'confirmed debt cannot be disputed afterward'
);
select * from finish();
rollback;
