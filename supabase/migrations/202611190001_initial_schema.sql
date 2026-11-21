-- Debt Ledger starter schema. Review and test with Supabase local before production.
-- All money values are integer IQD; all timestamps are timestamptz (UTC).

create extension if not exists pgcrypto;

create type public.transaction_kind as enum ('debt', 'payment');
create type public.transaction_status as enum ('pending', 'confirmed', 'disputed', 'cancelled');
create type public.customer_link_status as enum ('invited', 'active', 'declined', 'blocked');
create type public.device_platform as enum ('ios', 'android');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null unique,
  display_name text,
  preferred_locale text not null default 'ar' check (preferred_locale in ('ar', 'ckb')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 2 and 120),
  currency_code text not null default 'IQD' check (currency_code = 'IQD'),
  created_at timestamptz not null default now()
);

create table public.merchant_entitlements (
  business_id uuid primary key references public.businesses(id) on delete restrict,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  paid_until timestamptz,
  store_platform text check (store_platform in ('apple', 'google')),
  store_product_id text,
  revenuecat_app_user_id text,
  updated_at timestamptz not null default now(),
  constraint trial_range_valid check (trial_ends_at > trial_started_at)
);

create table public.customer_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_user_id uuid references public.profiles(id) on delete set null,
  customer_phone_e164 text not null,
  customer_display_name text not null check (length(trim(customer_display_name)) between 1 and 120),
  credit_limit_iqd bigint not null default 0 check (credit_limit_iqd >= 0),
  status public.customer_link_status not null default 'invited',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (business_id, customer_phone_e164)
);
create unique index customer_links_business_user_unique
  on public.customer_links (business_id, customer_user_id)
  where customer_user_id is not null;
create index customer_links_customer_user_idx on public.customer_links(customer_user_id);
create index customer_links_phone_idx on public.customer_links(customer_phone_e164);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_link_id uuid not null references public.customer_links(id) on delete restrict,
  created_by uuid not null,
  kind public.transaction_kind not null,
  amount_iqd bigint not null check (amount_iqd > 0),
  description text not null default '' check (length(description) <= 1000),
  occurred_at timestamptz not null default now(),
  due_at timestamptz,
  status public.transaction_status not null default 'pending',
  responded_by uuid,
  responded_at timestamptz,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (created_by, idempotency_key),
  constraint response_fields_match_status check (
    (status = 'pending' and responded_by is null and responded_at is null)
    or (status <> 'pending' and responded_by is not null and responded_at is not null)
  )
);
create index ledger_transactions_business_created_idx
  on public.ledger_transactions(business_id, created_at desc);
create index ledger_transactions_link_status_idx
  on public.ledger_transactions(customer_link_id, status, created_at desc);

create table public.transaction_events (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  actor_user_id uuid,
  event_type text not null check (event_type in ('created', 'approved', 'disputed', 'cancelled')),
  event_payload jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (transaction_id, idempotency_key)
);
create index transaction_events_transaction_idx on public.transaction_events(transaction_id, id);

create table public.device_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid not null,
  platform public.device_platform not null,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, installation_id)
);
create unique index one_active_merchant_device_per_user
  on public.device_installations(user_id) where is_active = true;
create unique index one_active_merchant_account_per_installation
  on public.device_installations(installation_id) where is_active = true;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempt_count integer not null default 0,
  last_error text
);
create index notification_outbox_pending_idx
  on public.notification_outbox(created_at) where delivered_at is null;

create table public.store_webhook_events (
  event_id text primary key,
  app_user_id text,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null
);

-- Create/update a profile after successful Supabase phone signup.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.phone is null or length(trim(new.phone)) = 0 then
    raise exception 'A verified phone number is required';
  end if;

  insert into public.profiles (id, phone_e164, preferred_locale)
  values (
    new.id,
    new.phone,
    case when new.raw_user_meta_data ->> 'preferred_locale' = 'ckb' then 'ckb' else 'ar' end
  )
  on conflict (id) do update set phone_e164 = excluded.phone_e164;

  -- Attach an invited link to this verified account, but keep it invited until the customer accepts.
  update public.customer_links
     set customer_user_id = new.id
   where customer_phone_e164 = new.phone
     and customer_user_id is null
     and status = 'invited';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- RLS helper functions. SECURITY DEFINER avoids recursive policy evaluation.
create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = auth.uid()
  );
$$;

create or replace function public.merchant_write_allowed(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.merchant_entitlements e
    where e.business_id = p_business_id
      and (e.trial_ends_at > now() or e.paid_until > now())
  );
$$;

create or replace function public.has_customer_link_to_business(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.customer_links cl
    where cl.business_id = p_business_id
      and cl.customer_user_id = auth.uid()
      and cl.status in ('invited', 'active')
  );
$$;

create or replace function public.can_read_transaction(p_transaction_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ledger_transactions t
    left join public.businesses b on b.id = t.business_id
    left join public.customer_links cl on cl.id = t.customer_link_id
    where t.id = p_transaction_id
      and (b.owner_user_id = auth.uid() or cl.customer_user_id = auth.uid())
  );
$$;

-- The 30-day trial begins once, when the first shop profile is created on the server.
create or replace function public.create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(p_name)) > 120 then
    raise exception 'Business name must be between 2 and 120 characters';
  end if;
  if exists (select 1 from public.businesses where owner_user_id = auth.uid()) then
    raise exception 'A business already exists for this account';
  end if;

  insert into public.businesses(owner_user_id, name)
  values (auth.uid(), trim(p_name))
  returning id into v_business_id;

  insert into public.merchant_entitlements(business_id, trial_started_at, trial_ends_at, revenuecat_app_user_id)
  values (v_business_id, now(), now() + interval '30 days', auth.uid()::text);

  return v_business_id;
end;
$$;

create or replace function public.accept_customer_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.customer_links cl
     set status = 'active', accepted_at = now()
   where cl.id = p_link_id
     and cl.customer_user_id = auth.uid()
     and cl.status = 'invited';
  if not found then raise exception 'Invitation not found or already processed'; end if;
end;
$$;

create or replace function public.set_customer_credit_limit(p_link_id uuid, p_limit_iqd bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_business_id uuid;
begin
  if p_limit_iqd < 0 then raise exception 'Credit limit cannot be negative'; end if;
  select cl.business_id into v_business_id
    from public.customer_links cl where cl.id = p_link_id for update;
  if v_business_id is null or not public.is_business_owner(v_business_id) then
    raise exception 'Not authorized';
  end if;
  if not public.merchant_write_allowed(v_business_id) then
    raise exception 'Subscription required; account is read-only';
  end if;
  update public.customer_links set credit_limit_iqd = p_limit_iqd where id = p_link_id;
end;
$$;

create or replace function public.create_transaction_request(
  p_link_id uuid,
  p_kind public.transaction_kind,
  p_amount_iqd bigint,
  p_description text,
  p_due_at timestamptz,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_customer_user_id uuid;
  v_limit bigint;
  v_confirmed_balance bigint;
  v_pending_debt bigint;
  v_pending_payment bigint;
  v_tx_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount_iqd is null or p_amount_iqd <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_amount_iqd > 1000000000000 then raise exception 'Amount is outside supported range'; end if;
  if length(coalesce(p_description, '')) > 1000 then raise exception 'Description is too long'; end if;

  select cl.business_id, cl.customer_user_id, cl.credit_limit_iqd
    into v_business_id, v_customer_user_id, v_limit
    from public.customer_links cl
   where cl.id = p_link_id and cl.status = 'active'
   for update;

  if v_business_id is null or not public.is_business_owner(v_business_id) then
    raise exception 'Customer link not found or not authorized';
  end if;
  if v_customer_user_id is null then raise exception 'Customer has not accepted the invitation'; end if;
  if not public.merchant_write_allowed(v_business_id) then
    raise exception 'Subscription required; account is read-only';
  end if;

  -- Idempotent retry after network loss returns the original transaction.
  select id into v_tx_id from public.ledger_transactions
   where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_tx_id is not null then return v_tx_id; end if;

  select coalesce(sum(case when kind = 'debt' then amount_iqd else -amount_iqd end), 0)
    into v_confirmed_balance
    from public.ledger_transactions
   where customer_link_id = p_link_id and status = 'confirmed';
  if v_confirmed_balance < 0 then raise exception 'Ledger balance integrity error'; end if;

  select coalesce(sum(amount_iqd), 0) into v_pending_debt
    from public.ledger_transactions
   where customer_link_id = p_link_id and status = 'pending' and kind = 'debt';
  select coalesce(sum(amount_iqd), 0) into v_pending_payment
    from public.ledger_transactions
   where customer_link_id = p_link_id and status = 'pending' and kind = 'payment';

  if p_kind = 'debt' then
    if v_limit = 0 or (v_confirmed_balance + v_pending_debt + p_amount_iqd) > v_limit then
      raise exception 'Customer credit limit would be exceeded';
    end if;
  elsif p_kind = 'payment' then
    if p_amount_iqd > greatest(v_confirmed_balance - v_pending_payment, 0) then
      raise exception 'Payment request exceeds available confirmed balance';
    end if;
  end if;

  insert into public.ledger_transactions(
    business_id, customer_link_id, created_by, kind, amount_iqd,
    description, due_at, idempotency_key
  ) values (
    v_business_id, p_link_id, auth.uid(), p_kind, p_amount_iqd,
    coalesce(trim(p_description), ''), p_due_at, p_idempotency_key
  ) returning id into v_tx_id;

  insert into public.transaction_events(transaction_id, actor_user_id, event_type, event_payload, idempotency_key)
  values (v_tx_id, auth.uid(), 'created', jsonb_build_object('kind', p_kind, 'amount_iqd', p_amount_iqd), p_idempotency_key);

  insert into public.notification_outbox(recipient_user_id, event_type, payload)
  values (v_customer_user_id, 'transaction_pending', jsonb_build_object('transaction_id', v_tx_id));

  return v_tx_id;
end;
$$;

create or replace function public.respond_to_transaction(
  p_transaction_id uuid,
  p_decision text,
  p_idempotency_key uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.ledger_transactions%rowtype;
  v_owner_id uuid;
  v_event_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approve', 'dispute') then raise exception 'Decision must be approve or dispute'; end if;

  select t.* into v_transaction
    from public.ledger_transactions t
    join public.customer_links cl on cl.id = t.customer_link_id
   where t.id = p_transaction_id
     and cl.customer_user_id = auth.uid()
   for update of t;
  if not found then raise exception 'Transaction not found or not authorized'; end if;

  -- Idempotent repeat of a completed response is harmless only if the same event key exists.
  if exists (
    select 1 from public.transaction_events e
    where e.transaction_id = p_transaction_id and e.idempotency_key = p_idempotency_key
  ) then return; end if;
  if v_transaction.status <> 'pending' then raise exception 'Transaction is no longer pending'; end if;

  v_event_type := case when p_decision = 'approve' then 'approved' else 'disputed' end;
  update public.ledger_transactions
     set status = case when p_decision = 'approve' then 'confirmed'::public.transaction_status else 'disputed'::public.transaction_status end,
         responded_by = auth.uid(),
         responded_at = now()
   where id = p_transaction_id;

  insert into public.transaction_events(transaction_id, actor_user_id, event_type, event_payload, idempotency_key)
  values (p_transaction_id, auth.uid(), v_event_type, jsonb_build_object('decision', p_decision), p_idempotency_key);

  select b.owner_user_id into v_owner_id
    from public.businesses b where b.id = v_transaction.business_id;
  insert into public.notification_outbox(recipient_user_id, event_type, payload)
  values (v_owner_id, 'transaction_responded', jsonb_build_object('transaction_id', p_transaction_id, 'decision', p_decision));
end;
$$;

create or replace function public.cancel_pending_transaction(p_transaction_id uuid, p_idempotency_key uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tx public.ledger_transactions%rowtype; v_customer uuid;
begin
  select t.* into v_tx from public.ledger_transactions t
   where t.id = p_transaction_id and public.is_business_owner(t.business_id)
   for update;
  if not found then raise exception 'Transaction not found or not authorized'; end if;
  if not public.merchant_write_allowed(v_tx.business_id) then raise exception 'Subscription required'; end if;
  if v_tx.status <> 'pending' then raise exception 'Only pending transactions can be cancelled'; end if;
  select customer_user_id into v_customer from public.customer_links where id = v_tx.customer_link_id;
  update public.ledger_transactions set status = 'cancelled', responded_by = auth.uid(), responded_at = now() where id = p_transaction_id;
  insert into public.transaction_events(transaction_id, actor_user_id, event_type, idempotency_key)
  values (p_transaction_id, auth.uid(), 'cancelled', p_idempotency_key);
  if v_customer is not null then
    insert into public.notification_outbox(recipient_user_id, event_type, payload)
    values (v_customer, 'transaction_cancelled', jsonb_build_object('transaction_id', p_transaction_id));
  end if;
end;
$$;

create or replace function public.register_merchant_device(p_installation_id uuid, p_platform public.device_platform)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_auth_time bigint;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_business_id from public.businesses where owner_user_id = auth.uid();
  if v_business_id is null then return 'not_merchant'; end if;

  select installation_id into v_existing
    from public.device_installations
   where user_id = auth.uid() and is_active = true
   limit 1;

  if v_existing is not null and v_existing = p_installation_id then
    update public.device_installations set last_seen_at = now() where user_id = auth.uid() and installation_id = p_installation_id;
    return 'same_device';
  end if;

  if exists (select 1 from public.device_installations d where d.installation_id = p_installation_id and d.is_active = true and d.user_id <> auth.uid()) then
    return 'installation_bound_to_another_account';
  end if;

  if v_existing is not null then
    v_auth_time := nullif(auth.jwt() ->> 'auth_time', '')::bigint;
    if v_auth_time is null or to_timestamp(v_auth_time) < now() - interval '10 minutes' then
      return 'fresh_otp_required';
    end if;
    update public.device_installations
       set is_active = false, revoked_at = now()
     where user_id = auth.uid() and is_active = true;
  end if;

  insert into public.device_installations(user_id, installation_id, platform)
  values (auth.uid(), p_installation_id, p_platform)
  on conflict (user_id, installation_id) do update
    set is_active = true, revoked_at = null, last_seen_at = now(), platform = excluded.platform;
  return 'registered';
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform public.device_platform)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_token is null or length(p_token) > 500 then raise exception 'Invalid push token'; end if;
  insert into public.push_tokens(user_id, expo_push_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

-- Defense in depth: no direct deletion, and no changes to transaction facts after creation.
create or replace function public.guard_ledger_transaction_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Ledger transactions cannot be deleted'; end if;
  if new.id <> old.id
     or new.business_id <> old.business_id
     or new.customer_link_id <> old.customer_link_id
     or new.created_by <> old.created_by
     or new.kind <> old.kind
     or new.amount_iqd <> old.amount_iqd
     or new.description <> old.description
     or new.occurred_at <> old.occurred_at
     or new.due_at is distinct from old.due_at
     or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at then
    raise exception 'Transaction facts are immutable';
  end if;
  if old.status <> 'pending' or new.status not in ('confirmed', 'disputed', 'cancelled') then
    raise exception 'Invalid transaction state transition';
  end if;
  return new;
end;
$$;
create trigger guard_ledger_transaction_update
before update or delete on public.ledger_transactions
for each row execute function public.guard_ledger_transaction_update();

create or replace function public.guard_append_only_events()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Transaction events are append-only';
end;
$$;
create trigger guard_transaction_events_update_delete
before update or delete on public.transaction_events
for each row execute function public.guard_append_only_events();

-- RLS
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.merchant_entitlements enable row level security;
alter table public.customer_links enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.transaction_events enable row level security;
alter table public.device_installations enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.store_webhook_events enable row level security;

create policy profiles_select_self on public.profiles
for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy businesses_select_owner_or_customer on public.businesses
for select to authenticated using (
  owner_user_id = auth.uid() or public.has_customer_link_to_business(id)
);

create policy entitlements_select_owner on public.merchant_entitlements
for select to authenticated using (public.is_business_owner(business_id));

create policy customer_links_select_participant on public.customer_links
for select to authenticated using (
  public.is_business_owner(business_id)
  or customer_user_id = auth.uid()
  or customer_phone_e164 = (select p.phone_e164 from public.profiles p where p.id = auth.uid())
);

create policy transactions_select_participant on public.ledger_transactions
for select to authenticated using (
  public.is_business_owner(business_id)
  or exists (
    select 1 from public.customer_links cl
    where cl.id = ledger_transactions.customer_link_id and cl.customer_user_id = auth.uid()
  )
);

create policy events_select_transaction_participant on public.transaction_events
for select to authenticated using (public.can_read_transaction(transaction_id));

create policy device_installations_select_self on public.device_installations
for select to authenticated using (user_id = auth.uid());

-- No direct client writes to money, events, subscriptions, outbox, or tokens.
revoke all on public.profiles, public.businesses, public.merchant_entitlements,
  public.customer_links, public.ledger_transactions, public.transaction_events,
  public.device_installations, public.push_tokens, public.notification_outbox,
  public.store_webhook_events from anon, authenticated;

grant select on public.profiles, public.businesses, public.merchant_entitlements,
  public.customer_links, public.ledger_transactions, public.transaction_events,
  public.device_installations to authenticated;
grant update (display_name, preferred_locale) on public.profiles to authenticated;

revoke all on function public.is_business_owner(uuid) from public;
revoke all on function public.has_customer_link_to_business(uuid) from public;
revoke all on function public.can_read_transaction(uuid) from public;
revoke all on function public.merchant_write_allowed(uuid) from public;
revoke all on function public.create_business(text) from public;
revoke all on function public.accept_customer_link(uuid) from public;
revoke all on function public.set_customer_credit_limit(uuid, bigint) from public;
revoke all on function public.create_transaction_request(uuid, public.transaction_kind, bigint, text, timestamptz, uuid) from public;
revoke all on function public.respond_to_transaction(uuid, text, uuid) from public;
revoke all on function public.cancel_pending_transaction(uuid, uuid) from public;
revoke all on function public.register_merchant_device(uuid, public.device_platform) from public;
revoke all on function public.register_push_token(text, public.device_platform) from public;

grant execute on function public.is_business_owner(uuid) to authenticated;
grant execute on function public.has_customer_link_to_business(uuid) to authenticated;
grant execute on function public.can_read_transaction(uuid) to authenticated;
grant execute on function public.create_business(text) to authenticated;
grant execute on function public.accept_customer_link(uuid) to authenticated;
grant execute on function public.set_customer_credit_limit(uuid, bigint) to authenticated;
grant execute on function public.create_transaction_request(uuid, public.transaction_kind, bigint, text, timestamptz, uuid) to authenticated;
grant execute on function public.respond_to_transaction(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_pending_transaction(uuid, uuid) to authenticated;
grant execute on function public.register_merchant_device(uuid, public.device_platform) to authenticated;
grant execute on function public.register_push_token(text, public.device_platform) to authenticated;

create or replace function public.add_customer(
  p_phone_e164 text,
  p_display_name text,
  p_credit_limit_iqd bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_customer_user_id uuid;
  v_link_id uuid;
begin
  select id into v_business_id from public.businesses where owner_user_id = auth.uid();
  if v_business_id is null then raise exception 'Business not found'; end if;
  if not public.merchant_write_allowed(v_business_id) then raise exception 'Subscription required; account is read-only'; end if;
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Phone number must be in E.164 format'; end if;
  if length(trim(coalesce(p_display_name, ''))) < 1 or length(trim(p_display_name)) > 120 then raise exception 'Invalid customer name'; end if;
  if p_credit_limit_iqd < 0 then raise exception 'Credit limit cannot be negative'; end if;

  if exists (select 1 from public.profiles where id = auth.uid() and phone_e164 = p_phone_e164) then
    raise exception 'You cannot add your own phone as a customer';
  end if;
  select id into v_customer_user_id from public.profiles where phone_e164 = p_phone_e164;
  insert into public.customer_links(
    business_id, customer_user_id, customer_phone_e164,
    customer_display_name, credit_limit_iqd, status
  ) values (
    v_business_id, v_customer_user_id, p_phone_e164,
    trim(p_display_name), p_credit_limit_iqd,
    case when v_customer_user_id is null then 'invited'::public.customer_link_status else 'invited'::public.customer_link_status end
  ) returning id into v_link_id;

  if v_customer_user_id is not null then
    insert into public.notification_outbox(recipient_user_id, event_type, payload)
    values (v_customer_user_id, 'shop_link_invitation', jsonb_build_object('link_id', v_link_id));
  end if;
  return v_link_id;
end;
$$;

create or replace function public.get_customer_balance(p_link_id uuid)
returns table(confirmed_balance_iqd bigint, pending_debt_iqd bigint, credit_limit_iqd bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.customer_links cl
    join public.businesses b on b.id = cl.business_id
    where cl.id = p_link_id and (b.owner_user_id = auth.uid() or cl.customer_user_id = auth.uid())
  ) then raise exception 'Not authorized'; end if;

  return query
  select
    coalesce(sum(case when t.status = 'confirmed' and t.kind = 'debt' then t.amount_iqd
                      when t.status = 'confirmed' and t.kind = 'payment' then -t.amount_iqd
                      else 0 end), 0)::bigint,
    coalesce(sum(case when t.status = 'pending' and t.kind = 'debt' then t.amount_iqd else 0 end), 0)::bigint,
    cl.credit_limit_iqd
  from public.customer_links cl
  left join public.ledger_transactions t on t.customer_link_id = cl.id
  where cl.id = p_link_id
  group by cl.credit_limit_iqd;
end;
$$;

revoke all on function public.add_customer(text, text, bigint) from public;
revoke all on function public.get_customer_balance(uuid) from public;
grant execute on function public.add_customer(text, text, bigint) to authenticated;
grant execute on function public.get_customer_balance(uuid) to authenticated;

