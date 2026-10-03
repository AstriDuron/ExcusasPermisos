-- Ejecutar una vez en Supabase SQL Editor.
-- Convierte Personal y accesos en un flujo con historico de aprobacion/inactivacion.
-- Tambien reafirma que nuevos registros queden pendientes por defecto.

alter table public.profiles
  alter column active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, department, position, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'personal',
    'Institución',
    'Personal',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table if not exists public.profile_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Sistema',
  action text not null check (action in ('registered', 'access_approved', 'access_deactivated')),
  title text not null,
  from_status text,
  to_status text,
  comment text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profile_events enable row level security;

drop policy if exists "profile_events_select_admin_or_own" on public.profile_events;
create policy "profile_events_select_admin_or_own"
on public.profile_events
for select
to authenticated
using (public.is_admin() or profile_id = auth.uid());

drop policy if exists "profile_events_insert_admin" on public.profile_events;
create policy "profile_events_insert_admin"
on public.profile_events
for insert
to authenticated
with check (public.is_admin() and actor_id = auth.uid());

insert into public.profile_events (
  profile_id,
  actor_id,
  actor_name,
  action,
  title,
  to_status,
  created_at
)
select
  profiles.id,
  profiles.id,
  profiles.full_name,
  'registered',
  'Registro solicitado',
  case when profiles.active then 'Activo' else 'Pendiente' end,
  profiles.created_at
from public.profiles
where not exists (
  select 1
  from public.profile_events
  where profile_events.profile_id = profiles.id
    and profile_events.action = 'registered'
);
