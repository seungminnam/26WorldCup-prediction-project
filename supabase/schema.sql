create extension if not exists pgcrypto;

create table public.teams (
  id text primary key,
  name text not null,
  country_code text not null unique,
  group_code text not null check (group_code ~ '^[A-L]$'),
  rating numeric not null,
  flag_emoji text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fixtures (
  id text primary key,
  match_number integer not null unique,
  group_code text check (group_code ~ '^[A-L]$'),
  stage text not null check (
    stage in (
      'group',
      'round_of_32',
      'round_of_16',
      'quarterfinal',
      'semifinal',
      'third_place',
      'final'
    )
  ),
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  kickoff_at timestamptz not null,
  venue text not null,
  status text not null check (status in ('scheduled', 'live', 'result_pending', 'final')),
  home_goals integer,
  away_goals integer,
  source text not null default 'manual_seed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status <> 'final' and home_goals is null and away_goals is null)
    or
    (status = 'final' and home_goals is not null and away_goals is not null)
  )
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null references public.fixtures(id) on delete cascade,
  team_id text references public.teams(id),
  player_name text not null,
  minute integer not null check (minute >= 0 and minute <= 130),
  event_type text not null check (event_type in ('goal', 'own_goal', 'penalty_goal', 'penalty_miss', 'red_card', 'yellow_card')),
  created_at timestamptz not null default now()
);

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  training_data_cutoff date,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid references public.model_versions(id),
  simulation_count integer not null check (simulation_count > 0),
  mode text not null check (mode in ('pre_tournament', 'current_snapshot', 'custom_scenario')),
  input_hash text not null,
  champion_team_id text references public.teams(id),
  created_at timestamptz not null default now()
);

create table public.forecast_probabilities (
  forecast_run_id uuid not null references public.forecast_runs(id) on delete cascade,
  team_id text not null references public.teams(id),
  round_of_32 numeric not null check (round_of_32 >= 0 and round_of_32 <= 1),
  round_of_16 numeric not null check (round_of_16 >= 0 and round_of_16 <= 1),
  quarterfinal numeric not null check (quarterfinal >= 0 and quarterfinal <= 1),
  semifinal numeric not null check (semifinal >= 0 and semifinal <= 1),
  final numeric not null check (final >= 0 and final <= 1),
  champion numeric not null check (champion >= 0 and champion <= 1),
  primary key (forecast_run_id, team_id)
);

create table public.bracket_snapshots (
  forecast_run_id uuid primary key references public.forecast_runs(id) on delete cascade,
  bracket jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.match_events enable row level security;
alter table public.model_versions enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.forecast_probabilities enable row level security;
alter table public.bracket_snapshots enable row level security;

create policy "public read teams" on public.teams for select using (true);
create policy "public read fixtures" on public.fixtures for select using (true);
create policy "public read match events" on public.match_events for select using (true);
create policy "public read model versions" on public.model_versions for select using (true);
create policy "public read forecast runs" on public.forecast_runs for select using (true);
create policy "public read forecast probabilities" on public.forecast_probabilities for select using (true);
create policy "public read bracket snapshots" on public.bracket_snapshots for select using (true);

create index fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index fixtures_stage_idx on public.fixtures (stage);
create index fixtures_group_idx on public.fixtures (group_code);
create index match_events_fixture_idx on public.match_events (fixture_id);
create index forecast_runs_created_idx on public.forecast_runs (created_at desc);
