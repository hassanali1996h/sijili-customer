-- Allow an anonymized customer link to remain in the other party's ledger.
alter table public.customer_links alter column customer_phone_e164 drop not null;

-- Run only from the trusted SQL administration session after retention review.
-- No app or Edge Function role can call this procedure.
create function public.process_account_deletion(
  p_user_id uuid,
  p_requested_at timestamptz,
  p_retention_policy_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_phone text;
begin
  if nullif(trim(p_retention_policy_reference), '') is null then
    raise exception 'An approved retention policy reference is required';
  end if;

  -- Lock the exact request reviewed by the operator. A withdrawn or renewed
  -- request must be reviewed again.
  perform 1 from public.account_deletion_requests
   where user_id = p_user_id and requested_at = p_requested_at
   for update;
  if not found then return false; end if;

  select p.phone_e164 into strict v_phone from public.profiles p where p.id = p_user_id;
  perform pg_advisory_xact_lock(hashtextextended('invite-phone:' || v_phone, 0));
  perform 1 from public.profiles where id = p_user_id for update;
  perform 1 from public.businesses where owner_user_id = p_user_id for update;

  -- Create/cancel/approve may be in progress. Lock the affected links before
  -- closing pending requests, and leave finalized transactions unchanged.
  perform 1 from public.customer_links cl
   where cl.customer_user_id = p_user_id
      or exists (select 1 from public.businesses b where b.id = cl.business_id and b.owner_user_id = p_user_id)
   order by cl.id
   for update of cl;

  with closed as (
    update public.ledger_transactions t
       set status = 'cancelled', responded_by = p_user_id, responded_at = now()
      from public.customer_links cl, public.businesses b
     where cl.id = t.customer_link_id and b.id = t.business_id
       and t.status = 'pending'
       and (cl.customer_user_id = p_user_id or b.owner_user_id = p_user_id)
    returning t.id
  )
  insert into public.transaction_events(transaction_id, actor_user_id, event_type, event_payload, idempotency_key)
  select id, null, 'cancelled', jsonb_build_object('reason', 'account_deleted'), gen_random_uuid()
    from closed;

  update public.customer_links
     set customer_user_id = null, customer_phone_e164 = null,
         customer_display_name = 'حساب محذوف', status = 'blocked', credit_limit_iqd = 0
   where customer_user_id = p_user_id
      or (customer_user_id is null and status = 'invited' and customer_phone_e164 = v_phone);

  update public.customer_links cl set status = 'blocked'
   where cl.status = 'invited' and exists (
     select 1 from public.businesses b where b.id = cl.business_id and b.owner_user_id = p_user_id
   );

  update public.merchant_entitlements e set revenuecat_app_user_id = null, paid_until = null
   where exists (select 1 from public.businesses b where b.id = e.business_id and b.owner_user_id = p_user_id);

  -- FK cascades remove the profile, device registrations, recipient outbox,
  -- and pending deletion request. Shared ledger rows retain their original IDs.
  delete from auth.users where id = p_user_id;
  if not found then raise exception 'Authentication account not found'; end if;
  return true;
end;
$$;

revoke all on function public.process_account_deletion(uuid, timestamptz, text)
  from public, anon, authenticated, service_role;

-- Hold the shop lock until the invitation transaction finishes.
create or replace function public.add_customer(p_phone_e164 text, p_display_name text, p_credit_limit_iqd bigint)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_business_id uuid;
  v_customer_user_id uuid;
  v_link_id uuid;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Phone number must be in E.164 format'; end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then raise exception 'Invalid customer name'; end if;
  if p_credit_limit_iqd is null or p_credit_limit_iqd < 0 then raise exception 'Credit limit cannot be negative'; end if;

  perform pg_advisory_xact_lock(hashtextextended('invite-phone:' || p_phone_e164, 0));
  select id into v_business_id from public.businesses where owner_user_id = auth.uid() for key share;
  if v_business_id is null then raise exception 'Business not found'; end if;
  if not public.merchant_write_allowed(v_business_id) then raise exception 'Subscription required; account is read-only'; end if;
  select p.id into v_customer_user_id
    from public.profiles p join auth.users u on u.id = p.id
   where p.phone_e164 = p_phone_e164 and u.phone_confirmed_at is not null
     and '+' || ltrim(trim(u.phone), '+') = p_phone_e164;
  if v_customer_user_id = auth.uid() then raise exception 'You cannot add your own phone as a customer'; end if;

  insert into public.customer_links(business_id, customer_user_id, customer_phone_e164, customer_display_name, credit_limit_iqd)
  values (v_business_id, v_customer_user_id, p_phone_e164, trim(p_display_name), p_credit_limit_iqd)
  returning id into v_link_id;

  if v_customer_user_id is not null then
    insert into public.notification_outbox(recipient_user_id, event_type, payload)
    values (v_customer_user_id, 'shop_link_invitation', jsonb_build_object('link_id', v_link_id));
  end if;
  return v_link_id;
end;
$$;

