create or replace function public.decline_customer_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.customer_link_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select cl.status
    into v_status
    from public.customer_links cl
   where cl.id = p_link_id
     and cl.customer_user_id = auth.uid()
   for update;

  if not found then
    raise exception 'Invitation not found or not authorized';
  end if;

  if v_status = 'declined' then
    return;
  end if;

  if v_status <> 'invited' then
    raise exception 'Only a pending invitation can be declined';
  end if;

  update public.customer_links
     set status = 'declined'
   where id = p_link_id;
end;
$$;

revoke all on function public.decline_customer_link(uuid) from public;
grant execute on function public.decline_customer_link(uuid) to authenticated;

