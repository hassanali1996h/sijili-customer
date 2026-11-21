create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant select, delete on public.account_deletion_requests to service_role;

create policy own_account_deletion_request
on public.account_deletion_requests for select to authenticated
using (user_id = auth.uid());

create function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'Authentication required';
  end if;
  insert into public.account_deletion_requests (user_id) values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.request_account_deletion() from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;

