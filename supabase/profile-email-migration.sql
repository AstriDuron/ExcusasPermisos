-- Ejecutar una vez en Supabase SQL Editor.
-- Agrega correo al perfil para mostrarlo en Personal y accesos.

alter table public.profiles
  add column if not exists email text;

update public.profiles
set email = auth.users.email
from auth.users
where profiles.id = auth.users.id
  and (profiles.email is null or profiles.email = '');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, department, position, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'personal',
    'Institución',
    'Personal',
    false
  )
  on conflict (id) do update set
    email = excluded.email;
  return new;
end;
$$;
