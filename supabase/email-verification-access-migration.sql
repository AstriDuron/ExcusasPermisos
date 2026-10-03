-- Ejecutar en Supabase SQL Editor.
-- Sincroniza si el correo fue confirmado y evita aprobar accesos sin verificación.

alter table public.profiles
add column if not exists email_confirmed_at timestamptz;

update public.profiles
set
  email = auth.users.email,
  email_confirmed_at = auth.users.email_confirmed_at
from auth.users
where profiles.id = auth.users.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name, role, department, position, active, email_confirmed_at)
  values (
    new.id,
    new.email,
    profile_name,
    'personal',
    'Institución',
    'Personal',
    false,
    new.email_confirmed_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at;

  if not exists (
    select 1
    from public.profile_events
    where profile_id = new.id
      and action = 'registered'
  ) then
    insert into public.profile_events (
      profile_id,
      actor_id,
      actor_name,
      action,
      title,
      to_status,
      comment
    )
    values (
      new.id,
      new.id,
      profile_name,
      'registered',
      'Registro solicitado',
      'Solicitado',
      'Cuenta registrada por el usuario.'
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_profile_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  update public.profiles
  set
    email = new.email,
    email_confirmed_at = new.email_confirmed_at
  where id = new.id;

  if not found then
    insert into public.profiles (id, email, full_name, role, department, position, active, email_confirmed_at)
    values (
      new.id,
      new.email,
      profile_name,
      'personal',
      'Institución',
      'Personal',
      false,
      new.email_confirmed_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_verified on auth.users;
create trigger on_auth_user_email_verified
after update of email, email_confirmed_at on auth.users
for each row
execute function public.sync_profile_email_verification();

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

  if target_active = true and target_profile.email_confirmed_at is null then
    raise exception 'El usuario debe confirmar su correo antes de aprobar el acceso.';
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
