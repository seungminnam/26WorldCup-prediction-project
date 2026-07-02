begin;

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
  at.flag_emoji as away_team_flag,
  f.home_slot,
  f.away_slot,
  f.elapsed_minutes
from public.fixtures f
left join public.venues v on v.id = f.venue_id
left join public.teams ht on ht.id = f.home_team_id
left join public.teams at on at.id = f.away_team_id;

commit;
