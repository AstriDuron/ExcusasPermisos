create or replace function public.set_profile_access(
  target_profile_id uuid,
  target_active boolean,
  review_comment text default ''
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
  select *
  into actor_profile
  from public.profiles
  where id = auth.uid()
    and role = 'admin'
    and active = true;

  if actor_profile.id is null then
    raise exception 'Solo un administrador activo puede actualizar accesos.';
  end if;

  if target_profile_id = actor_profile.id and target_active = false then
    raise exception 'No puede inactivar su propia cuenta de administrador.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id;

  if target_profile.id is null then
    raise exception 'Perfil no encontrado.';
  end if;

  update public.profiles
  set active = target_active
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
    case when target_active then 'access_approved' else 'access_deactivated' end,
    case when target_active then 'Acceso aprobado' else 'Acceso inactivado' end,
    case when target_profile.active then 'Activo' else 'Solicitado' end,
    case when target_active then 'Activo' else 'Inactivo' end,
    coalesce(review_comment, '')
  );

  return true;
end;
$$;

revoke all on function public.set_profile_access(uuid, boolean, text) from public;
grant execute on function public.set_profile_access(uuid, boolean, text) to authenticated;
