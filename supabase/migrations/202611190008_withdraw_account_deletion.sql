create function public.withdraw_account_deletion_request()
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.account_deletion_requests where user_id = v_user_id;
end;
$$;

revoke all on function public.withdraw_account_deletion_request() from public, anon, authenticated;
grant execute on function public.withdraw_account_deletion_request() to authenticated;

