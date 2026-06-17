create table public.data_providers (
  id text primary key,
  name text not null,
  base_url text,
  status text not null default 'active' check (status in ('active', 'disabled', 'evaluation')),
  latest_sync_at timestamptz,
  mapped_fixture_count integer not null default 0 check (mapped_fixture_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_team_mappings (
  provider_id text not null references public.data_providers(id) on delete cascade,
  team_id text not null references public.teams(id) on delete cascade,
  provider_team_id text not null,
  provider_name text,
  provider_code text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, team_id),
  unique (provider_id, provider_team_id)
);

create table public.provider_fixture_mappings (
  provider_id text not null references public.data_providers(id) on delete cascade,
  fixture_id text not null references public.fixtures(id) on delete cascade,
  provider_fixture_id text not null,
  provider_season_id text,
  provider_league_id text,
  last_payload_hash text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, fixture_id),
  unique (provider_id, provider_fixture_id)
);

alter table public.match_events
add column source_event_id text;

alter table public.data_providers enable row level security;
alter table public.provider_team_mappings enable row level security;
alter table public.provider_fixture_mappings enable row level security;

create policy "public read data providers"
on public.data_providers
for select
using (true);

grant select on public.data_providers to anon, authenticated;

grant select, insert, update, delete on
  public.data_providers,
  public.provider_team_mappings,
  public.provider_fixture_mappings,
  public.match_events
to service_role;

create index provider_team_mappings_provider_team_idx
on public.provider_team_mappings (provider_id, provider_team_id);

create index provider_fixture_mappings_provider_fixture_idx
on public.provider_fixture_mappings (provider_id, provider_fixture_id);

create index provider_fixture_mappings_last_synced_idx
on public.provider_fixture_mappings (last_synced_at desc);

create unique index match_events_source_event_dedupe_idx
on public.match_events (source, source_event_id)
where source_event_id is not null;

create trigger set_data_providers_updated_at
before update on public.data_providers
for each row execute function app_private.set_updated_at();

create trigger set_provider_team_mappings_updated_at
before update on public.provider_team_mappings
for each row execute function app_private.set_updated_at();

create trigger set_provider_fixture_mappings_updated_at
before update on public.provider_fixture_mappings
for each row execute function app_private.set_updated_at();

insert into public.data_providers (id, name, base_url, status, notes)
values (
  'sportmonks',
  'Sportmonks',
  'https://api.sportmonks.com',
  'evaluation',
  'Primary candidate for near-live World Cup fixture, livescore, and event ingestion.'
)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  status = excluded.status,
  notes = excluded.notes;
