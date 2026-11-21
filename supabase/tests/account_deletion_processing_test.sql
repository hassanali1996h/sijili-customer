begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, phone, phone_confirmed_at)
values ('84000000-0000-4000-8000-000000000001', '96475000000201', now()),
       ('84000000-0000-4000-8000-000000000002', '96475000000202', now());
insert into public.businesses (id, owner_user_id, name)
values ('84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000001', 'Test shop');
insert into public.customer_links (id, business_id, customer_user_id, customer_phone_e164, customer_display_name, status)
values ('84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000010',
        '84000000-0000-4000-8000-000000000002', '+96475000000202', 'Before deletion', 'active');
insert into public.ledger_transactions (id, business_id, customer_link_id, created_by, kind, amount_iqd, idempotency_key)
values ('84000000-0000-4000-8000-000000000012', '84000000-0000-4000-8000-000000000010',
        '84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000001', 'debt', 500, gen_random_uuid());
insert into public.account_deletion_requests (user_id, requested_at)
values ('84000000-0000-4000-8000-000000000002', '2026-11-19T10:00:00Z');

select ok(not has_function_privilege('authenticated', 'public.process_account_deletion(uuid,timestamptz,text)', 'execute'), 'app users cannot process deletions');
select ok(not has_function_privilege('service_role', 'public.process_account_deletion(uuid,timestamptz,text)', 'execute'), 'Edge Functions cannot process deletions');
select is(public.process_account_deletion('84000000-0000-4000-8000-000000000002', '2026-11-18T10:00:00Z', 'fixture'), false, 'a stale request cannot authorize deletion');
select ok(public.process_account_deletion('84000000-0000-4000-8000-000000000002', '2026-11-19T10:00:00Z', 'fixture'), 'the reviewed request is processed');
select ok(not exists (select 1 from auth.users where id = '84000000-0000-4000-8000-000000000002'), 'login identity is removed');
select ok((select customer_user_id is null and customer_phone_e164 is null and status = 'blocked'
  from public.customer_links where id = '84000000-0000-4000-8000-000000000011'), 'link is anonymized and no longer accepts new requests');
select ok((select status = 'cancelled' and amount_iqd = 500
  from public.ledger_transactions where id = '84000000-0000-4000-8000-000000000012'), 'pending transaction closes with facts preserved');
select ok(exists (select 1 from public.transaction_events
  where transaction_id = '84000000-0000-4000-8000-000000000012'
    and event_type = 'cancelled' and event_payload->>'reason' = 'account_deleted'), 'the cancellation has an audit event');
select * from finish();
rollback;

