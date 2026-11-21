create table public.notification_push_receipts (
  ticket_id text primary key check (length(ticket_id) between 1 and 200),
  outbox_id bigint not null references public.notification_outbox(id) on delete cascade,
  registration_id uuid,
  registration_seen_at timestamptz,
  created_at timestamptz not null default now(),
  next_check_at timestamptz not null default now() + interval '15 minutes',
  claim_token uuid,
  result text check (result in ('provider_accepted', 'provider_error', 'unknown')),
  error_code text,
  checked_at timestamptz
);

create index notification_push_receipts_due_idx
  on public.notification_push_receipts(next_check_at, ticket_id) where checked_at is null;
create index notification_push_receipts_outbox_idx
  on public.notification_push_receipts(outbox_id);

alter table public.notification_push_receipts enable row level security;
revoke all on public.notification_push_receipts from public, anon, authenticated;
grant select on public.notification_push_receipts to service_role;

-- Persist accepted tickets and finish the send lease in the same transaction.
create function public.record_notification_push_tickets(p_id bigint, p_claim_token uuid, p_tickets jsonb)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_tickets is null or jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) = 0 then
    raise exception 'At least one accepted ticket is required';
  end if;
  if not public.complete_notification_outbox(p_id, p_claim_token, true) then
    return false;
  end if;

  insert into public.notification_push_receipts(ticket_id, outbox_id, registration_id, registration_seen_at)
  select t.ticket_id, p_id, t.registration_id, t.registration_seen_at
    from jsonb_to_recordset(p_tickets) as t(ticket_id text, registration_id uuid, registration_seen_at timestamptz);
  return true;
end;
$$;

create function public.claim_notification_push_receipts(p_claim_token uuid)
returns table (ticket_id text, created_at timestamptz)
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  with due as (
    select r.ticket_id
      from public.notification_push_receipts r
     where p_claim_token is not null and r.checked_at is null and r.next_check_at <= now()
     order by r.next_check_at, r.ticket_id
     limit 100
     for update skip locked
  )
  update public.notification_push_receipts r
     set claim_token = p_claim_token, next_check_at = now() + interval '5 minutes'
    from due
   where r.ticket_id = due.ticket_id
  returning r.ticket_id, r.created_at;
$$;

create function public.complete_notification_push_receipt(
  p_ticket_id text, p_claim_token uuid, p_result text, p_error_code text default null
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_registration_id uuid;
  v_registration_seen_at timestamptz;
begin
  if p_result is null or p_result not in ('provider_accepted', 'provider_error', 'unknown', 'pending') then
    raise exception 'Invalid receipt result';
  end if;

  if p_result = 'pending' then
    update public.notification_push_receipts
       set claim_token = null, next_check_at = now() + interval '15 minutes'
     where ticket_id = p_ticket_id and claim_token = p_claim_token and checked_at is null;
    return found;
  end if;

  select r.registration_id, r.registration_seen_at into v_registration_id, v_registration_seen_at
    from public.notification_push_receipts r
   where r.ticket_id = p_ticket_id and r.claim_token = p_claim_token and r.checked_at is null
   for update;
  if not found then return false; end if;

  if p_result = 'provider_error' and p_error_code = 'DeviceNotRegistered' then
    delete from public.push_tokens where id = v_registration_id and last_seen_at = v_registration_seen_at;
  end if;

  update public.notification_push_receipts
     set result = p_result, error_code = left(p_error_code, 100), checked_at = now(),
         claim_token = null, registration_id = null, registration_seen_at = null
   where ticket_id = p_ticket_id;
  return true;
end;
$$;

revoke all on function public.record_notification_push_tickets(bigint, uuid, jsonb),
  public.claim_notification_push_receipts(uuid),
  public.complete_notification_push_receipt(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_notification_push_tickets(bigint, uuid, jsonb),
  public.claim_notification_push_receipts(uuid),
  public.complete_notification_push_receipt(text, uuid, text, text) to service_role;

