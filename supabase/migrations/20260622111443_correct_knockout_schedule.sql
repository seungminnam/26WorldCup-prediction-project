begin;

update public.fixtures as fixture
set
  kickoff_at = correction.kickoff_at::timestamptz,
  venue_id = correction.venue_id,
  venue_name = correction.venue_name
from (
  values
    ('M-90', '2026-07-04T17:00:00Z', 'houston', 'NRG Stadium'),
    ('M-91', '2026-07-05T20:00:00Z', 'new-york-new-jersey', 'MetLife Stadium'),
    ('M-92', '2026-07-06T00:00:00Z', 'mexico-city', 'Estadio Banorte'),
    ('M-94', '2026-07-07T00:00:00Z', 'seattle', 'Lumen Field'),
    ('M-96', '2026-07-07T20:00:00Z', 'vancouver', 'BC Place'),
    ('M-97', '2026-07-09T20:00:00Z', 'boston', 'Gillette Stadium'),
    ('M-98', '2026-07-10T19:00:00Z', 'los-angeles', 'SoFi Stadium')
) as correction(fixture_id, kickoff_at, venue_id, venue_name)
where fixture.id = correction.fixture_id;

update public.provider_fixture_mappings
set provider_fixture_id = 'reassign:' || provider_fixture_id
where provider_id = 'espn'
  and fixture_id in ('M-90', 'M-91', 'M-92', 'M-94', 'M-96', 'M-97', 'M-98');

update public.provider_fixture_mappings as mapping
set
  provider_fixture_id = correction.provider_fixture_id,
  last_payload_hash = null,
  last_synced_at = null,
  updated_at = now()
from (
  values
    ('M-90', '760502'),
    ('M-91', '760504'),
    ('M-92', '760505'),
    ('M-94', '760507'),
    ('M-96', '760508'),
    ('M-97', '760510'),
    ('M-98', '760511')
) as correction(fixture_id, provider_fixture_id)
where mapping.provider_id = 'espn'
  and mapping.fixture_id = correction.fixture_id;

commit;
