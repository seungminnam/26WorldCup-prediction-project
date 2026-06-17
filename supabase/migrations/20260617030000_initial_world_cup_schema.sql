create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.venues (
  id text primary key,
  name text not null,
  city text not null,
  region text,
  country_code text not null check (country_code ~ '^[A-Z]{2,3}$'),
  timezone text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id text primary key,
  fifa_code text not null unique check (fifa_code ~ '^[A-Z]{3}$'),
  name text not null,
  official_name text,
  short_name text,
  country_code text not null unique check (country_code ~ '^[A-Z]{2,3}$'),
  group_code text not null check (group_code ~ '^[A-L]$'),
  confederation text,
  rating numeric(7, 2) not null check (rating > 0),
  flag_emoji text,
  flag_image_url text,
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_aliases (
  team_id text not null references public.teams(id) on delete cascade,
  alias text not null,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  primary key (team_id, alias, locale)
);

create table public.fixtures (
  id text primary key,
  match_number integer not null unique check (match_number > 0),
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
  venue_id text references public.venues(id),
  venue_name text,
  status text not null check (status in ('scheduled', 'live', 'result_pending', 'final', 'postponed')),
  home_goals integer check (home_goals is null or home_goals >= 0),
  away_goals integer check (away_goals is null or away_goals >= 0),
  home_penalties integer check (home_penalties is null or home_penalties >= 0),
  away_penalties integer check (away_penalties is null or away_penalties >= 0),
  winner_team_id text references public.teams(id),
  result_verified_at timestamptz,
  source text not null default 'manual_seed',
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (stage = 'group' and group_code is not null)
    or
    (stage <> 'group')
  ),
  check (
    home_team_id is null
    or away_team_id is null
    or home_team_id <> away_team_id
  ),
  check (
    (status in ('scheduled', 'result_pending', 'postponed') and home_goals is null and away_goals is null)
    or
    (status in ('live', 'final') and home_goals is not null and away_goals is not null)
  ),
  check (
    winner_team_id is null
    or winner_team_id = home_team_id
    or winner_team_id = away_team_id
  ),
  check (
    (home_penalties is null and away_penalties is null)
    or
    (home_penalties is not null and away_penalties is not null)
  )
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null references public.fixtures(id) on delete cascade,
  team_id text references public.teams(id),
  player_name text not null,
  assist_player_name text,
  minute integer not null check (minute >= 0 and minute <= 130),
  stoppage_minute integer check (stoppage_minute is null or stoppage_minute >= 0),
  event_type text not null check (
    event_type in (
      'goal',
      'own_goal',
      'penalty_goal',
      'penalty_miss',
      'red_card',
      'yellow_card',
      'substitution'
    )
  ),
  is_confirmed boolean not null default true,
  source text not null default 'manual_seed',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  description text,
  training_data_cutoff date,
  algorithm text,
  metrics jsonb not null default '{}'::jsonb,
  artifact_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid references public.model_versions(id),
  simulation_count integer not null check (simulation_count > 0),
  mode text not null check (mode in ('pre_tournament', 'current_snapshot', 'custom_scenario')),
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  input_hash text not null,
  scenario_name text,
  source_data_cutoff timestamptz,
  champion_team_id text references public.teams(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.forecast_probabilities (
  forecast_run_id uuid not null references public.forecast_runs(id) on delete cascade,
  team_id text not null references public.teams(id),
  group_winner numeric(6, 5) check (group_winner is null or group_winner between 0 and 1),
  advance_group numeric(6, 5) check (advance_group is null or advance_group between 0 and 1),
  round_of_32 numeric(6, 5) not null check (round_of_32 between 0 and 1),
  round_of_16 numeric(6, 5) not null check (round_of_16 between 0 and 1),
  quarterfinal numeric(6, 5) not null check (quarterfinal between 0 and 1),
  semifinal numeric(6, 5) not null check (semifinal between 0 and 1),
  final numeric(6, 5) not null check (final between 0 and 1),
  champion numeric(6, 5) not null check (champion between 0 and 1),
  expected_points numeric(6, 3),
  created_at timestamptz not null default now(),
  primary key (forecast_run_id, team_id)
);

create table public.group_projection_snapshots (
  forecast_run_id uuid not null references public.forecast_runs(id) on delete cascade,
  team_id text not null references public.teams(id),
  group_code text not null check (group_code ~ '^[A-L]$'),
  expected_position numeric(5, 3),
  expected_points numeric(6, 3),
  first_place numeric(6, 5) check (first_place is null or first_place between 0 and 1),
  second_place numeric(6, 5) check (second_place is null or second_place between 0 and 1),
  third_place numeric(6, 5) check (third_place is null or third_place between 0 and 1),
  fourth_place numeric(6, 5) check (fourth_place is null or fourth_place between 0 and 1),
  advance_probability numeric(6, 5) check (advance_probability is null or advance_probability between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (forecast_run_id, team_id)
);

create table public.bracket_snapshots (
  forecast_run_id uuid primary key references public.forecast_runs(id) on delete cascade,
  bracket jsonb not null,
  created_at timestamptz not null default now()
);

create table public.prediction_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  fixture_overrides jsonb not null default '[]'::jsonb,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text,
  status text not null check (status in ('started', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rows_seen integer,
  rows_changed integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create or replace view public.fixture_cards
with (security_invoker = true)
as
select
  f.id,
  f.match_number,
  f.group_code,
  f.stage,
  f.kickoff_at,
  f.status,
  f.home_goals,
  f.away_goals,
  f.home_penalties,
  f.away_penalties,
  f.winner_team_id,
  f.result_verified_at,
  f.source,
  f.source_url,
  coalesce(v.name, f.venue_name) as venue_name,
  v.city as venue_city,
  v.country_code as venue_country_code,
  v.timezone as venue_timezone,
  ht.id as home_team_id,
  ht.name as home_team_name,
  ht.fifa_code as home_team_code,
  ht.flag_emoji as home_team_flag,
  at.id as away_team_id,
  at.name as away_team_name,
  at.fifa_code as away_team_code,
  at.flag_emoji as away_team_flag
from public.fixtures f
left join public.venues v on v.id = f.venue_id
left join public.teams ht on ht.id = f.home_team_id
left join public.teams at on at.id = f.away_team_id;

create or replace view public.group_standings_current
with (security_invoker = true)
as
with match_rows as (
  select
    f.group_code,
    f.home_team_id as team_id,
    f.home_goals as goals_for,
    f.away_goals as goals_against
  from public.fixtures f
  where f.stage = 'group'
    and f.status = 'final'
    and f.home_team_id is not null
    and f.away_team_id is not null
  union all
  select
    f.group_code,
    f.away_team_id as team_id,
    f.away_goals as goals_for,
    f.home_goals as goals_against
  from public.fixtures f
  where f.stage = 'group'
    and f.status = 'final'
    and f.home_team_id is not null
    and f.away_team_id is not null
),
aggregated as (
  select
    t.id as team_id,
    t.name as team_name,
    t.fifa_code,
    t.flag_emoji,
    t.group_code,
    count(m.team_id)::integer as played,
    coalesce(sum(case when m.goals_for > m.goals_against then 1 else 0 end), 0)::integer as wins,
    coalesce(sum(case when m.goals_for = m.goals_against then 1 else 0 end), 0)::integer as draws,
    coalesce(sum(case when m.goals_for < m.goals_against then 1 else 0 end), 0)::integer as losses,
    coalesce(sum(m.goals_for), 0)::integer as goals_for,
    coalesce(sum(m.goals_against), 0)::integer as goals_against,
    coalesce(sum(m.goals_for - m.goals_against), 0)::integer as goal_difference,
    coalesce(sum(
      case
        when m.goals_for > m.goals_against then 3
        when m.goals_for = m.goals_against then 1
        else 0
      end
    ), 0)::integer as points
  from public.teams t
  left join match_rows m on m.team_id = t.id
  group by t.id, t.name, t.fifa_code, t.flag_emoji, t.group_code
)
select
  row_number() over (
    partition by group_code
    order by points desc, goal_difference desc, goals_for desc, team_name asc
  )::integer as position,
  *
from aggregated;

create or replace view public.latest_forecast_probabilities
with (security_invoker = true)
as
with latest_runs as (
  select distinct on (mode)
    id,
    mode,
    model_version_id,
    simulation_count,
    source_data_cutoff,
    created_at
  from public.forecast_runs
  where visibility = 'public'
  order by mode, created_at desc
)
select
  lr.mode,
  lr.id as forecast_run_id,
  lr.model_version_id,
  lr.simulation_count,
  lr.source_data_cutoff,
  lr.created_at as forecast_created_at,
  fp.team_id,
  t.name as team_name,
  t.fifa_code,
  t.group_code,
  t.flag_emoji,
  fp.group_winner,
  fp.advance_group,
  fp.round_of_32,
  fp.round_of_16,
  fp.quarterfinal,
  fp.semifinal,
  fp.final,
  fp.champion,
  fp.expected_points
from latest_runs lr
join public.forecast_probabilities fp on fp.forecast_run_id = lr.id
join public.teams t on t.id = fp.team_id;

alter table public.venues enable row level security;
alter table public.teams enable row level security;
alter table public.team_aliases enable row level security;
alter table public.fixtures enable row level security;
alter table public.match_events enable row level security;
alter table public.model_versions enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.forecast_probabilities enable row level security;
alter table public.group_projection_snapshots enable row level security;
alter table public.bracket_snapshots enable row level security;
alter table public.prediction_scenarios enable row level security;

create policy "public read venues" on public.venues for select using (true);
create policy "public read teams" on public.teams for select using (true);
create policy "public read team aliases" on public.team_aliases for select using (true);
create policy "public read fixtures" on public.fixtures for select using (true);
create policy "public read match events" on public.match_events for select using (true);
create policy "public read model versions" on public.model_versions for select using (true);
create policy "public read forecast runs" on public.forecast_runs for select using (visibility = 'public');
create policy "public read forecast probabilities" on public.forecast_probabilities for select using (
  exists (
    select 1
    from public.forecast_runs fr
    where fr.id = forecast_probabilities.forecast_run_id
      and fr.visibility = 'public'
  )
);
create policy "public read group projection snapshots" on public.group_projection_snapshots for select using (
  exists (
    select 1
    from public.forecast_runs fr
    where fr.id = group_projection_snapshots.forecast_run_id
      and fr.visibility = 'public'
  )
);
create policy "public read bracket snapshots" on public.bracket_snapshots for select using (
  exists (
    select 1
    from public.forecast_runs fr
    where fr.id = bracket_snapshots.forecast_run_id
      and fr.visibility = 'public'
  )
);
create policy "public read featured scenarios" on public.prediction_scenarios for select using (is_featured = true);

grant usage on schema public to anon, authenticated;
grant select on
  public.venues,
  public.teams,
  public.team_aliases,
  public.fixtures,
  public.match_events,
  public.model_versions,
  public.forecast_runs,
  public.forecast_probabilities,
  public.group_projection_snapshots,
  public.bracket_snapshots,
  public.prediction_scenarios,
  public.fixture_cards,
  public.group_standings_current,
  public.latest_forecast_probabilities
to anon, authenticated;

create index venues_country_idx on public.venues (country_code);
create index teams_group_idx on public.teams (group_code);
create index teams_rating_idx on public.teams (rating desc);
create index fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index fixtures_status_idx on public.fixtures (status);
create index fixtures_stage_idx on public.fixtures (stage);
create index fixtures_group_idx on public.fixtures (group_code);
create index fixtures_home_team_idx on public.fixtures (home_team_id);
create index fixtures_away_team_idx on public.fixtures (away_team_id);
create index match_events_fixture_idx on public.match_events (fixture_id);
create index match_events_team_idx on public.match_events (team_id);
create index forecast_runs_mode_created_idx on public.forecast_runs (mode, created_at desc) where visibility = 'public';
create index forecast_probabilities_team_idx on public.forecast_probabilities (team_id);
create index group_projection_group_idx on public.group_projection_snapshots (forecast_run_id, group_code);

create trigger set_venues_updated_at
before update on public.venues
for each row execute function app_private.set_updated_at();

create trigger set_teams_updated_at
before update on public.teams
for each row execute function app_private.set_updated_at();

create trigger set_fixtures_updated_at
before update on public.fixtures
for each row execute function app_private.set_updated_at();

create trigger set_match_events_updated_at
before update on public.match_events
for each row execute function app_private.set_updated_at();

create trigger set_model_versions_updated_at
before update on public.model_versions
for each row execute function app_private.set_updated_at();

create trigger set_prediction_scenarios_updated_at
before update on public.prediction_scenarios
for each row execute function app_private.set_updated_at();
