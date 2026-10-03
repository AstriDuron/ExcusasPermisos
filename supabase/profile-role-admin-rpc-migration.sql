alter table public.profile_events
  drop constraint if exists profile_events_action_check;

alter table public.profile_events
  add constraint profile_events_action_check
  check (action in ('registered', 'access_approved', 'access_deactivated', 'role_changed'));

create or replace function public.set_profile_role(
  target_profile_id uuid,
  target_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
begin
  if target_role not in ('personal', 'admin') then
    raise exception 'Rol no válido.';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = auth.uid()
    and role = 'admin'
    and active = true;

  if actor_profile.id is null then
    raise exception 'Solo un administrador activo puede actualizar roles.';
  end if;

  if target_profile_id = actor_profile.id and target_role <> 'admin' then
    raise exception 'No puede quitarse su propio acceso de administrador.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id;

  if target_profile.id is null then
    raise exception 'Perfil no encontrado.';
  end if;

  update public.profiles
  set role = target_role
  where id = target_profile_id;

  insert into public.profile_events (
    profile_id,
    actor_id,
    actor_name,
    action,
    title,
    from_status,
    to_status,
    comment
  )
  values (
    target_profile_id,
    actor_profile.id,
    actor_profile.full_name,
    'role_changed',
    'Rol actualizado',
    case when target_profile.role = 'admin' then 'Administrador' else 'Personal' end,
    case when target_role = 'admin' then 'Administrador' else 'Personal' end,
    ''
  );

  return true;
end;
$$;

revoke all on function public.set_profile_role(uuid, text) from public;
grant execute on function public.set_profile_role(uuid, text) to authenticated;
