alter table public.notification_outbox
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists dead_lettered_at timestamptz;

create index if not exists notification_outbox_ready_idx
  on public.notification_outbox(next_attempt_at, id)
  where delivered_at is null and dead_lettered_at is null;

create or replace function public.claim_notification_outbox(
  p_claim_token uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  id bigint,
  recipient_user_id uuid,
  event_type text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null then raise exception 'Claim token is required'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'Claim limit must be between 1 and 100'; end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'Lease must be between 30 and 900 seconds'; end if;

  return query
  with candidates as (
    select o.id
      from public.notification_outbox o
     where o.delivered_at is null
       and o.dead_lettered_at is null
       and o.next_attempt_at <= now()
       and (o.claimed_at is null or o.claimed_at < now() - make_interval(secs => p_lease_seconds))
     order by o.id
     for update skip locked
     limit p_limit
  )
  update public.notification_outbox o
     set claim_token = p_claim_token,
         claimed_at = now(),
         attempt_count = o.attempt_count + 1
    from candidates c
   where o.id = c.id
  returning o.id, o.recipient_user_id, o.event_type, o.payload, o.attempt_count;
end;
$$;

create or replace function public.complete_notification_outbox(
  p_id bigint,
  p_claim_token uuid,
  p_succeeded boolean,
  p_error text default null,
  p_retry_after_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
  v_retry_base integer;
begin
  if p_id is null or p_claim_token is null then raise exception 'Outbox id and claim token are required'; end if;
  if p_succeeded is null then raise exception 'Completion status is required'; end if;
  v_retry_base := least(greatest(coalesce(p_retry_after_seconds, 60), 30), 3600);

  if p_succeeded then
    update public.notification_outbox
       set delivered_at = now(),
           claimed_at = null,
           claim_token = null,
           last_error = null
     where id = p_id
       and claim_token = p_claim_token
       and delivered_at is null
       and dead_lettered_at is null;
  else
    update public.notification_outbox
       set last_error = left(coalesce(nullif(trim(p_error), ''), 'Notification delivery failed'), 1000),
           next_attempt_at = case
             when attempt_count >= 8 then next_attempt_at
             else now() + make_interval(secs => least(v_retry_base * power(2, least(attempt_count - 1, 6))::integer, 3600))
           end,
           dead_lettered_at = case when attempt_count >= 8 then now() else null end,
           claimed_at = null,
           claim_token = null
     where id = p_id
       and claim_token = p_claim_token
       and delivered_at is null
       and dead_lettered_at is null;
  end if;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_notification_outbox(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_notification_outbox(bigint, uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(uuid, integer, integer) to service_role;
grant execute on function public.complete_notification_outbox(bigint, uuid, boolean, text, integer) to service_role;

