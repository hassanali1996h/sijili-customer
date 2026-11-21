create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_phone text := '+' || ltrim(trim(new.phone), '+');
begin
  if new.phone_confirmed_at is null or v_phone is null
     or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('invite-phone:' || v_phone, 0));
  insert into public.profiles (id, phone_e164, preferred_locale)
  values (new.id, v_phone, case when new.raw_user_meta_data ->> 'preferred_locale' = 'ckb' then 'ckb' else 'ar' end)
  on conflict (id) do update set phone_e164 = excluded.phone_e164;

  update public.customer_links cl
     set customer_user_id = new.id
   where cl.customer_phone_e164 = v_phone
     and cl.status = 'invited'
     and cl.customer_user_id is null
     and not exists (
       select 1 from public.customer_links existing
        where existing.business_id = cl.business_id and existing.customer_user_id = new.id
     );
  return new;
end;
$$;

drop trigger on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of phone, phone_confirmed_at on auth.users
for each row execute function public.handle_new_auth_user();

-- Reconcile invitations left unassigned by the previous trigger.
update public.customer_links cl
   set customer_user_id = null
 where cl.status = 'invited' and cl.customer_user_id is not null
   and not exists (
     select 1 from auth.users u
      where u.id = cl.customer_user_id and u.phone_confirmed_at is not null
        and '+' || ltrim(trim(u.phone), '+') = cl.customer_phone_e164
   );

insert into public.profiles (id, phone_e164, preferred_locale)
select u.id, '+' || ltrim(trim(u.phone), '+'),
       case when u.raw_user_meta_data ->> 'preferred_locale' = 'ckb' then 'ckb' else 'ar' end
  from auth.users u
 where u.phone_confirmed_at is not null and ltrim(trim(u.phone), '+') ~ '^[1-9][0-9]{7,14}$'
on conflict (id) do update set phone_e164 = excluded.phone_e164;

update public.customer_links cl
   set customer_user_id = p.id
  from public.profiles p join auth.users u on u.id = p.id
 where u.phone_confirmed_at is not null and p.phone_e164 = cl.customer_phone_e164
   and cl.status = 'invited' and cl.customer_user_id is null
   and not exists (
     select 1 from public.customer_links existing
      where existing.business_id = cl.business_id and existing.customer_user_id = p.id
   );

alter policy customer_links_select_participant on public.customer_links
using (public.is_business_owner(business_id) or customer_user_id = auth.uid());

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
  select id into v_business_id from public.businesses where owner_user_id = auth.uid();
  if v_business_id is null then raise exception 'Business not found'; end if;
  if not public.merchant_write_allowed(v_business_id) then raise exception 'Subscription required; account is read-only'; end if;
  if p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Phone number must be in E.164 format'; end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then raise exception 'Invalid customer name'; end if;
  if p_credit_limit_iqd is null or p_credit_limit_iqd < 0 then raise exception 'Credit limit cannot be negative'; end if;

  perform pg_advisory_xact_lock(hashtextextended('invite-phone:' || p_phone_e164, 0));
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

