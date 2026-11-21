-- Serialize creation retries and reject reuse of a key with different transaction facts.
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
  v_existing public.ledger_transactions%rowtype;
  v_tx_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_link_id is null or p_kind is null then raise exception 'Customer and transaction kind are required'; end if;
  if p_amount_iqd is null or p_amount_iqd <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_amount_iqd > 1000000000000 then raise exception 'Amount is outside supported range'; end if;
  if length(coalesce(p_description, '')) > 1000 then raise exception 'Description is too long'; end if;

  -- The key lock makes simultaneous retries serialize even if they target different links.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotency_key::text));

  select t.* into v_existing
    from public.ledger_transactions t
   where t.created_by = auth.uid() and t.idempotency_key = p_idempotency_key;
  if found then
    if not public.is_business_owner(v_existing.business_id) then
      raise exception 'Transaction not found or not authorized';
    end if;
    if v_existing.customer_link_id is distinct from p_link_id
       or v_existing.kind is distinct from p_kind
       or v_existing.amount_iqd is distinct from p_amount_iqd
       or v_existing.description is distinct from coalesce(trim(p_description), '')
       or v_existing.due_at is distinct from p_due_at then
      raise exception 'Idempotency key was already used for a different transaction';
    end if;
    return v_existing.id;
  end if;

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

-- A replay with the same decision is harmless; a key cannot silently switch approval to dispute.
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
  v_existing_event_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision is null or p_decision not in ('approve', 'dispute') then raise exception 'Decision must be approve or dispute'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  select t.* into v_transaction
    from public.ledger_transactions t
    join public.customer_links cl on cl.id = t.customer_link_id
   where t.id = p_transaction_id
     and cl.customer_user_id = auth.uid()
   for update of t;
  if not found then raise exception 'Transaction not found or not authorized'; end if;

  v_event_type := case when p_decision = 'approve' then 'approved' else 'disputed' end;
  select e.event_type into v_existing_event_type
    from public.transaction_events e
   where e.transaction_id = p_transaction_id and e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_event_type is distinct from v_event_type then
      raise exception 'Idempotency key was already used for a different decision';
    end if;
    return;
  end if;
  if v_transaction.status <> 'pending' then raise exception 'Transaction is no longer pending'; end if;

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

