-- Ejecutar una vez en Supabase SQL Editor.
-- Agrega historico de solicitudes y bloquea cambios de estado cuando ya estan aprobadas.

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

alter table public.request_events enable row level security;

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

drop trigger if exists requests_prevent_approved_status_change on public.requests;
create trigger requests_prevent_approved_status_change
before update on public.requests
for each row
execute function public.prevent_approved_status_change();

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

insert into public.request_events (
  request_id,
  actor_id,
  actor_name,
  action,
  title,
  created_at
)
select
  requests.id,
  requests.user_id,
  coalesce(profiles.full_name, 'Personal'),
  'created',
  'Solicitud registrada',
  requests.created_at
from public.requests
left join public.profiles on profiles.id = requests.user_id
where not exists (
  select 1
  from public.request_events
  where request_events.request_id = requests.id
    and request_events.action = 'created'
);

insert into public.request_events (
  request_id,
  actor_id,
  actor_name,
  action,
  title,
  comment,
  created_at
)
select
  requests.id,
  requests.user_id,
  coalesce(profiles.full_name, 'Personal'),
  'attachment_added',
  'Comprobante adjuntado',
  request_files.file_name,
  request_files.created_at
from public.request_files
join public.requests on requests.id = request_files.request_id
left join public.profiles on profiles.id = requests.user_id
where not exists (
  select 1
  from public.request_events
  where request_events.request_id = requests.id
    and request_events.action = 'attachment_added'
);

insert into public.request_events (
  request_id,
  actor_id,
  actor_name,
  action,
  title,
  from_status,
  to_status,
  comment,
  created_at
)
select
  requests.id,
  requests.reviewed_by,
  coalesce(reviewers.full_name, 'Administracion'),
  'status_changed',
  'Estado cambiado a ' || requests.status,
  'pendiente',
  requests.status,
  requests.review_comment,
  requests.updated_at
from public.requests
left join public.profiles reviewers on reviewers.id = requests.reviewed_by
where requests.status <> 'pendiente'
  and not exists (
    select 1
    from public.request_events
    where request_events.request_id = requests.id
      and request_events.action = 'status_changed'
  );
