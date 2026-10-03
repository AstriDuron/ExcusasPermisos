create or replace function public.get_access_request_status(lookup_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when profiles.id is null then 'none'
    when profiles.active = true then 'active'
    when exists (
      select 1
      from public.profile_events
      where profile_events.profile_id = profiles.id
        and profile_events.action = 'access_deactivated'
    ) then 'inactive'
    else 'pending'
  end
  from (select lower(trim(lookup_email)) as email) input
  left join public.profiles
    on lower(profiles.email) = input.email
  limit 1;
$$;

revoke all on function public.get_access_request_status(text) from public;
grant execute on function public.get_access_request_status(text) to anon, authenticated;
