alter table public.requests
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.requests
  drop constraint if exists valid_request_hours;

alter table public.requests
  add constraint valid_request_hours check (
    (
      schedule <> 'Por horas'
      and start_time is null
      and end_time is null
    )
    or (
      schedule = 'Por horas'
      and start_date = end_date
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
  );
