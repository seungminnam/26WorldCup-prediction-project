update public.fixtures
set kickoff_at = '2026-07-01T02:00:00.000Z',
    updated_at = now()
where id = 'M-79'
  and match_number = 79;
