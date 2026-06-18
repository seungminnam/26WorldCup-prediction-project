insert into public.data_providers (id, name, base_url, status, notes)
values (
  'espn',
  'ESPN (unofficial)',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world',
  'evaluation',
  'Primary World Cup 2026 source. Free, keyless, undocumented/unofficial endpoint reverse-engineered from espn.com. Activate after fixture dry run and shadow validation.'
)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  status = excluded.status,
  notes = excluded.notes;

insert into public.data_providers (id, name, base_url, status, notes)
values (
  'football-data',
  'football-data.org',
  'https://api.football-data.org/v4',
  'evaluation',
  'Reconciliation-only fallback. Official, free-tier-eligible, but its World Cup response has no goal-event data, so it never receives canonical writes.'
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
  notes = 'Free plan rejects the 2026 season ("Free plans do not have access to this season, try from 2022 to 2024."). Kept as a dormant adapter in case of a future paid upgrade.'
where id = 'api-football';
