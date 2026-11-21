begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, phone, phone_confirmed_at)
values ('83000000-0000-4000-8000-000000000001', '96475000000100', now());

insert into public.push_tokens (id, user_id, expo_push_token, platform)
values
  ('83000000-0000-4000-8000-000000000010', '83000000-0000-4000-8000-000000000001', 'fixture-old', 'ios'),
  ('83000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000001', 'fixture-refreshed', 'android');

insert into public.notification_outbox (recipient_user_id, event_type, claim_token, claimed_at)
values ('83000000-0000-4000-8000-000000000001', 'shop_link_invitation', '83000000-0000-4000-8000-000000000020', now());

select ok(not has_table_privilege('authenticated', 'public.notification_push_receipts', 'SELECT'), 'app users cannot read receipts');
select ok(not has_function_privilege('anon', 'public.claim_notification_push_receipts(uuid)', 'EXECUTE'), 'anonymous users cannot claim receipts');
select ok(public.record_notification_push_tickets(
  (select id from public.notification_outbox where claim_token = '83000000-0000-4000-8000-000000000020'),
  '83000000-0000-4000-8000-000000000020',
  (select jsonb_agg(jsonb_build_object(
    'ticket_id', expo_push_token, 'registration_id', id, 'registration_seen_at', last_seen_at
  )) from public.push_tokens where user_id = '83000000-0000-4000-8000-000000000001')
), 'recording accepts the current send lease');
select ok((select delivered_at is not null from public.notification_outbox where recipient_user_id = '83000000-0000-4000-8000-000000000001'), 'tickets complete the dispatch');
select is((select count(*) from public.claim_notification_push_receipts('83000000-0000-4000-8000-000000000030') where ticket_id like 'fixture-%'), 0::bigint, 'receipts wait before the first lookup');

update public.notification_push_receipts set next_check_at = now() where ticket_id like 'fixture-%';
update public.push_tokens set last_seen_at = now() + interval '1 second' where expo_push_token = 'fixture-refreshed';
select is((select count(*) from public.claim_notification_push_receipts('83000000-0000-4000-8000-000000000030') where ticket_id like 'fixture-%'), 2::bigint, 'both due tickets are claimed');
select ok(not public.complete_notification_push_receipt('fixture-old', '83000000-0000-4000-8000-000000000031', 'provider_error', 'DeviceNotRegistered'), 'an unrelated lease cannot finish a receipt');
select ok(public.complete_notification_push_receipt('fixture-old', '83000000-0000-4000-8000-000000000030', 'provider_error', 'DeviceNotRegistered')
  and public.complete_notification_push_receipt('fixture-refreshed', '83000000-0000-4000-8000-000000000030', 'provider_error', 'DeviceNotRegistered'), 'the receipt worker can finish its tickets');
select is(
  (select array_agg(expo_push_token order by expo_push_token) from public.push_tokens where user_id = '83000000-0000-4000-8000-000000000001'),
  array['fixture-refreshed'], 'only the unchanged registration is removed'
);

select * from finish();
rollback;

