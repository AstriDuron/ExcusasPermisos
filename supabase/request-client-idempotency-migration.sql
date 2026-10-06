-- Ejecutar en Supabase SQL Editor para evitar solicitudes duplicadas por doble clic o reintento del navegador.

alter table public.requests
  add column if not exists client_request_key text;

create unique index if not exists requests_client_request_key_unique
on public.requests (client_request_key)
where client_request_key is not null;
