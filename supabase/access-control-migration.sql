-- Ejecutar una vez en Supabase SQL Editor para activar el flujo:
-- registro abierto -> cuenta pendiente -> admin activa/inactiva.

alter table public.profiles
  alter column active set default false;

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

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "profiles_update_own_limited" on public.profiles;

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

-- Asegura que tu admin actual siga activo. Cambia el correo si usas otro.
update public.profiles
set active = true, role = 'admin', position = 'Administrador', department = 'Administración'
where id = (
  select id
  from auth.users
  where email = 'astrid7osorto@gmail.com'
);
