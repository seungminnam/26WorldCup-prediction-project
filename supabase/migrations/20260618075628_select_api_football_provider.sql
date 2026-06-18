insert into public.data_providers (id, name, base_url, status, notes)
values (
  'api-football',
  'API-Football',
  'https://v3.football.api-sports.io',
  'evaluation',
  'Selected World Cup 2026 primary candidate; activate after fixture dry run and shadow validation.'
)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  status = excluded.status,
  notes = excluded.notes;

update public.data_providers
set
  status = 'disabled',
  notes = 'Retained as a fallback adapter; not selected for the zero-cost MVP.'
where id = 'sportmonks';

grant usage on schema app_private to service_role;
grant insert on table app_private.ingestion_runs to service_role;

create or replace function public.record_ingestion_run(
  p_source text,
  p_status text,
  p_rows_seen integer,
  p_rows_changed integer,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.ingestion_runs (
    source,
    status,
    completed_at,
    rows_seen,
    rows_changed,
    error_message,
    metadata
  )
  values (
    p_source,
    p_status,
    now(),
    p_rows_seen,
    p_rows_changed,
    p_error_message,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_ingestion_run(text, text, integer, integer, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_ingestion_run(text, text, integer, integer, text, jsonb)
to service_role;
