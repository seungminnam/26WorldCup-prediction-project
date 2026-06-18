# World Cup 2026 Live Data Ingestion Design

## Context

The current app is a Next.js match centre backed by Supabase tables for teams, fixtures, match events, forecast runs, probabilities, group projections, and bracket snapshots. It can already render Supabase data and fall back to static seed data when the database is unavailable.

The next product step is to replace manual/static match data with a near-live sports data pipeline. The goal is not to create a betting-grade second-by-second feed. The goal is to make the app feel current during matchdays, keep finished results accurate, and recompute forecasts when tournament state changes.

## Decision

Use ESPN's public, keyless scoreboard endpoint as the World Cup 2026 primary provider. API-Football was evaluated first but its free plan was empirically confirmed to reject the 2026 season entirely ("Free plans do not have access to this season, try from 2022 to 2024."), making it non-viable for a zero-cost MVP regardless of polling strategy; it is now `disabled`. football-data.org (official, free-tier-eligible) is wired in as a read-only reconciliation check, since its World Cup response has fixtures/scores/status but no goal-event data. Sportmonks remains a disabled fallback adapter, unchanged. See `docs/superpowers/specs/2026-06-18-espn-football-data-provider-transition-design.md` for the full evaluation and decision record.

Use a hybrid update model:

- Fixture/schedule sync outside match windows.
- Near-live score/event sync for active matches.
- Final-result confirmation after each match.
- Forecast recomputation on meaningful state changes.
- Model retraining/rating updates after final results, not after every live event.

## Product Behavior

Users should see:

- Upcoming matches with kickoff time, venue, and source freshness.
- Live matches with score, clock/state, scorers, cards when available, and a visible "last synced" timestamp.
- Completed matches with verified final score and goalscorers.
- Current standings derived only from final results.
- Forecasts that are clearly labeled by data cutoff time.
- A subtle stale-data state when the feed has not updated within the expected window.

The site should use wording like "Near live" or "Updated moments ago" rather than promising perfect real-time accuracy.

## Architecture

```text
Sports Data Provider
  -> Private Ingestion Worker
  -> Supabase Postgres
  -> Forecast Runner
  -> Next.js App on Vercel
```

### Private Ingestion Worker

The worker owns provider API calls and writes to Supabase using server-only credentials. It must never run in the browser and must never expose provider tokens, Supabase service role keys, database passwords, or connection strings.

Recommended runtime:

- Railway, Fly.io, Render, or another private always-on worker host for 10-15 second matchday polling.
- Supabase Scheduled Edge Functions or Vercel Cron for lower-frequency fixture/result reconciliation.

### Supabase

Supabase remains the source of truth for the public app. Public tables can be read by the browser through RLS-protected read policies. Writes must happen only through the worker, Edge Functions, or controlled server-side jobs.

Use Supabase Realtime later if the UI needs live client updates without refresh. The initial implementation can rely on short server revalidation and manual refresh indicators.

### Next.js

The web app reads public match and forecast data from Supabase. It should show freshness metadata so portfolio reviewers can see the data pipeline behavior, not just the UI.

## Data Model Additions

Add provider mapping and ingestion metadata before writing live data:

- `public.data_providers`
  - Provider name, base URL, status, notes.
- `public.provider_fixture_mappings`
  - Local fixture ID.
  - Provider fixture ID.
  - Provider season/league IDs if needed.
  - Last provider payload hash.
  - Last synced timestamp.
- `public.provider_team_mappings`
  - Local team ID.
  - Provider team ID.
  - Provider display names/codes.
- `app_private.ingestion_runs`
  - Already exists and should be extended only if needed.
- Optional `app_private.provider_payload_audit`
  - Short-lived/debug-only raw payload snapshots.
  - Keep private and avoid storing unnecessary personal or licensed data.

Existing tables remain the public canonical model:

- `fixtures`
- `match_events`
- `forecast_runs`
- `forecast_probabilities`
- `group_projection_snapshots`
- `bracket_snapshots`

## Polling Strategy

Use smart polling instead of polling the entire tournament constantly.

### Normal Period

- Sync fixture schedule and metadata every 30 minutes to 6 hours.
- Sync recent final results every 5-15 minutes around matchdays.

### Match Window

For fixtures starting within the next 30 minutes or currently live:

- ESPN has no documented daily request cap, so poll the scoreboard endpoint every 10-15 minutes at all times rather than restricting to match windows.
- Stop high-frequency polling after the provider marks the fixture final.
- If ESPN ever becomes unavailable or is replaced, the same provider-adapter pattern (client/normalizer separated from canonical storage) supports swapping in a different source without changing the canonical data model.

### Post-Match Confirmation

After final whistle:

- Confirm final score immediately.
- Confirm again after 10-30 minutes for corrections.
- Run a daily reconciliation job for all completed tournament matches.

## Forecast Update Strategy

Do not retrain the model after every goal. Instead:

- During live matches, recompute tournament simulations from the current score/state.
- After final results, update standings, Elo/rating inputs, and create a new current-snapshot forecast run.
- Run model training/backtesting as a separate Python pipeline on a slower cadence.

This keeps the product responsive while keeping model artifacts auditable.

## Error Handling

The worker should:

- Record every sync attempt in `app_private.ingestion_runs`.
- Store rows seen, rows changed, provider, endpoint group, and error summary.
- Treat provider 429/rate-limit responses as recoverable and back off.
- Avoid deleting local data when provider payloads omit a match temporarily.
- Mark feed freshness in the UI instead of silently showing stale data.

## Security Requirements

This repository is public, so these rules are mandatory:

- Do not commit `.env`, `.vercel`, `supabase/.temp`, provider API tokens, service role keys, database URLs, JWT secrets, or generated credentials.
- Only browser-safe Supabase publishable keys may use `NEXT_PUBLIC_`.
- Provider tokens and Supabase service role keys belong only in private runtime secret stores.
- Public schemas must keep RLS enabled.
- Views exposed to anon/authenticated roles must use `security_invoker = true`.
- Private ingestion tables should stay in `app_private` unless there is a clear public read need.

## Testing And Verification

Before enabling real provider writes:

- Add parser tests with recorded, sanitized provider fixture payloads.
- Add idempotency tests for repeated sync payloads.
- Add status transition tests: scheduled -> live -> final.
- Add score correction tests after final.
- Add secret scans before every commit touching ingestion or deployment files.

For production verification:

- Run one dry sync that logs provider IDs without writing public fixture changes.
- Map a small set of fixtures manually and verify updates.
- Enable writes for fixtures first, then match events, then forecast triggers.

## Runtime Choice

The only unresolved runtime choice is where the high-frequency worker should live:

- Railway/Fly.io/Render worker for true matchday polling.
- Supabase Scheduled Edge Functions for simpler low-frequency reconciliation.
- Vercel Cron for web-app-adjacent scheduled jobs.

Recommendation: start with a private Node worker plus Supabase scheduled reconciliation. The worker host invokes the one-shot ESPN sync command on a fixed 10-15 minute cadence, while the database and app stack remain unchanged.

## References

- API-Football pricing: https://www.api-football.com/pricing
- API-Football World Cup 2026 guide: https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
- API-Football documentation: https://www.api-football.com/documentation
- Supabase Scheduled Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
