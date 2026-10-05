-- Ejecutar en Supabase SQL Editor.
-- Agrega el número de horas clase perdidas por solicitud.

alter table public.requests
add column if not exists class_hours numeric(4, 1) not null default 1;

alter table public.requests
drop constraint if exists requests_class_hours_check;

alter table public.requests
add constraint requests_class_hours_check
check (class_hours > 0 and class_hours <= 12);
