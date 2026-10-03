-- Ejecutar en Supabase SQL Editor.
-- No pegues la service_role key en la app. El frontend usa solo la anon public key.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null,
  role text not null default 'personal' check (role in ('personal', 'admin')),
  department text not null default 'Institución',
  position text not null default 'Personal',
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('excusa', 'permiso')),
  category text not null,
  start_date date not null,
  end_date date not null,
  schedule text not null,
  reason text not null check (char_length(reason) between 3 and 1200),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  review_comment text not null default '',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_request_dates check (end_date >= start_date)
);

create table if not exists public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamptz not null default now(),
  constraint allowed_file_types check (
    file_type = 'application/pdf'
    or file_type like 'image/%'
  )
);

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Sistema',
  action text not null check (action in ('created', 'attachment_added', 'status_changed')),
  title text not null,
  from_status text check (from_status in ('pendiente', 'aprobada', 'rechazada')),
  to_status text check (to_status in ('pendiente', 'aprobada', 'rechazada')),
  comment text not null default '',
  created_at timestamptz not null default now()
);

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

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;

create or replace function public.is_active_user(target_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user
      and active = true
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_approved_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'aprobada' and new.status is distinct from old.status then
    raise exception 'Una solicitud aprobada no puede cambiar de estado.';
  end if;

  return new;
end;
$$;

drop trigger if exists requests_touch_updated_at on public.requests;
create trigger requests_touch_updated_at
before update on public.requests
for each row
execute function public.touch_updated_at();

drop trigger if exists requests_prevent_approved_status_change on public.requests;
create trigger requests_prevent_approved_status_change
before update on public.requests
for each row
execute function public.prevent_approved_status_change();

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

  insert into public.profiles (id, email, full_name, role, department, position, active)
  values (
    new.id,
    new.email,
    profile_name,
    'personal',
    'Institución',
    'Personal',
    false
  )
  on conflict (id) do nothing;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.request_files enable row level security;
alter table public.request_events enable row level security;
alter table public.profile_events enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_limited" on public.profiles;

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "requests_select_own_or_admin" on public.requests;
create policy "requests_select_own_or_admin"
on public.requests
for select
to authenticated
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
  )
);

drop policy if exists "requests_insert_own" on public.requests;
create policy "requests_insert_own"
on public.requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pendiente'
  and public.is_active_user(auth.uid())
);

drop policy if exists "requests_update_admin_review" on public.requests;
create policy "requests_update_admin_review"
on public.requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "request_files_select_own_or_admin" on public.request_files;
create policy "request_files_select_own_or_admin"
on public.request_files
for select
to authenticated
using (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and public.is_active_user(auth.uid())
  )
);

drop policy if exists "request_files_insert_own" on public.request_files;
create policy "request_files_insert_own"
on public.request_files
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and public.is_active_user(auth.uid())
  and exists (
    select 1
    from public.requests
    where requests.id = request_id
      and requests.user_id = auth.uid()
  )
);

drop policy if exists "request_events_select_own_or_admin" on public.request_events;
create policy "request_events_select_own_or_admin"
on public.request_events
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.requests
    where requests.id = request_id
      and requests.user_id = auth.uid()
      and public.is_active_user(auth.uid())
  )
);

drop policy if exists "request_events_insert_actor" on public.request_events;
create policy "request_events_insert_actor"
on public.request_events
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1
      from public.requests
      where requests.id = request_id
        and requests.user_id = auth.uid()
        and public.is_active_user(auth.uid())
    )
  )
);

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_read_own_or_admin" on storage.objects;
create policy "storage_read_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'comprobantes'
  and (
    public.is_admin()
    or (
      owner = auth.uid()
      and public.is_active_user(auth.uid())
    )
    or exists (
      select 1
      from public.request_files
      where request_files.file_path = storage.objects.name
        and request_files.owner_id = auth.uid()
        and public.is_active_user(auth.uid())
    )
  )
);

drop policy if exists "storage_insert_own_folder" on storage.objects;
create policy "storage_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'comprobantes'
  and owner = auth.uid()
  and public.is_active_user(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_update_none" on storage.objects;
create policy "storage_update_none"
on storage.objects
for update
to authenticated
using (false)
with check (false);

drop policy if exists "storage_delete_admin_only" on storage.objects;
create policy "storage_delete_admin_only"
on storage.objects
for delete
to authenticated
using (bucket_id = 'comprobantes' and public.is_admin());

-- Para convertir una cuenta en admin, ejecuta esto cambiando el correo:
-- update public.profiles
-- set role = 'admin', position = 'Administrador', department = 'Administración'
-- where id = (select id from auth.users where email = 'admin@institucion.edu');
