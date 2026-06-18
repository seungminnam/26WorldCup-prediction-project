# API-Football Provider Transition Design

## Goal

Replace Sportmonks as the primary World Cup 2026 data provider with API-Football while preserving the existing provider-neutral Supabase model and tournament engine. The initial deployment must remain usable on API-Football's free plan and provide a clear upgrade path to more frequent polling.

## Context

The match centre needs factual tournament data for fixtures, live scores, match events, venues, kickoff times, and final results. It does not need a provider to calculate group tables, build forecast brackets, or generate tournament probabilities because those are owned by the local tournament engine.

The current ingestion foundation already separates provider IDs from canonical fixture and team records. Sportmonks-specific behavior is concentrated in the provider client, normalizer, CLI, and their tests, so changing providers now avoids deeper lock-in.

Sportmonks meets the functional requirements but does not meet the zero-cost MVP constraint. Its World Cup API is a paid product after the trial period. API-Football exposes the required World Cup competition and endpoints on its free plan, subject to a limit of 100 requests per day.

## API Requirements

### Required For The MVP

- Complete World Cup 2026 fixture coverage with stable fixture and team IDs.
- Kickoff timestamp, venue, group or knockout round, and home/away participants.
- Match status transitions from scheduled through live to final.
- Current score, elapsed match time, extra time, and penalty shootout result.
- Goal events including scorer, assist when present, own goals, and penalties.
- Corrected results and a reliable way to reconcile a final result after full time.
- Bulk fixture and live-score retrieval filtered by competition, season, or date.
- Explicit rate-limit headers and recoverable error responses.
- Server-side authentication that does not expose the provider key to the browser.

### Valuable After The MVP

- Cards and substitutions.
- Starting lineups, bench players, coaches, and formations.
- Tournament squads.
- Provider standings for comparison with locally derived standings.
- Match and player statistics.

### Intentionally Owned Locally

- Current and projected group tables.
- Best third-place ranking and Round of 32 assignment.
- Knockout bracket construction.
- Match probabilities and tournament forecasts.
- Forecast cutoff and model version metadata.

Provider predictions, betting odds, provider brackets, and live xG are not required for this transition.

## Provider Decision

API-Football becomes the primary provider candidate because its free plan includes all competitions and endpoints, including fixtures, livescores, events, lineups, and standings. Its published World Cup 2026 guide identifies the competition as league `1` for season `2026`.

The free plan allows 100 requests per day. This is enough for a cached portfolio MVP, but not for 10-15 second polling. The product must describe the feed as near-live and expose the last successful synchronization time.

KickoffAPI remains a comparison candidate during validation. It advertises the same 100-request daily free allowance and endpoint coverage, but it has a shorter public operating history. It must not become the production primary without a side-by-side data quality check.

football-data.org may be used only as a manual reconciliation reference or future fallback. Its free plan provides fixtures and delayed scores but does not provide the live event depth required by the PRD.

## Architecture

```text
API-Football
  -> API-Football client
  -> Provider response normalizer
  -> Provider-neutral ingestion records
  -> Existing mapping and Supabase writer
  -> Canonical fixtures and match_events
  -> Forecast trigger
  -> Next.js match centre
```

The public application continues to read only canonical Supabase data. It never calls API-Football directly.

### Provider Contract

The ingestion worker should expose a small internal provider contract rather than letting API-Football response fields spread through the application:

- Fetch fixtures for a date range and competition season.
- Fetch currently live fixtures for the configured competition.
- Normalize fixture identity, participants, kickoff, venue, round, status, score, and events.
- Report provider request metadata needed for rate-limit handling.

Provider-specific status codes must be translated at the adapter boundary into the existing canonical vocabulary: `scheduled`, `live`, `result_pending`, `final`, and `postponed`. Cancelled and postponed fixtures map to `postponed`; suspended and abandoned fixtures map to `result_pending` until reconciliation determines their final disposition. None of these provider states may silently fall back to `scheduled`.

### Canonical Data Ownership

- `provider_fixture_mappings` and `provider_team_mappings` own external-to-local identity.
- `fixtures` owns the latest canonical schedule, status, and score.
- `match_events` owns normalized event rows and uses provider event IDs for idempotency.
- `app_private.ingestion_runs` owns sync outcome, row counts, endpoint group, and errors.
- Forecast tables remain independent from the provider and are updated only after meaningful fixture changes.

## Free-Plan Polling Budget

The worker must treat the 100-request daily allowance as a hard budget and reserve capacity for final-result reconciliation.

Recommended matchday allocation:

- 1-2 calls for daily fixture and competition bootstrap.
- 60-75 calls for live fixture polling during known match windows.
- 3-8 calls for lineup retrieval, at most once per fixture after data becomes available.
- 4-8 calls for final-result confirmation and corrections.
- 2-4 calls for standings or manual reconciliation.
- At least 10 calls kept in reserve for retries and unexpected schedule changes.

The initial live interval should be 8-10 minutes and should run only from 15 minutes before kickoff until the match is final. A single competition-filtered live request should cover simultaneous World Cup fixtures. Event-specific calls should be avoided when the live fixture response already includes the required events.

Polling must stop before exhausting the daily allowance. When remaining quota is low, final-result reconciliation takes priority over lineups, statistics, and additional live refreshes.

If the project upgrades to the API-Football Pro plan, the same adapter can move to approximately one-minute live polling without changing the canonical data model.

## Product Behavior

- Show `Last synced` using the timestamp of the last successful ingestion run.
- On the free plan, describe data as `Near live` or `Updated within about 10 minutes`.
- Show a stale state when no successful update has occurred within twice the expected polling interval.
- Continue showing the last canonical data when the provider is unavailable.
- Never erase an event or fixture only because it is absent from one provider response.
- Derive current standings only from canonical final results.
- Recompute snapshot forecasts after a score or status change, not after every unchanged poll.

## Error Handling

- Treat `429` as recoverable, record the failed run, and stop requests until the provider reset time.
- Retry transient `5xx` and network failures with bounded exponential backoff.
- Reject payloads missing fixture identity or home/away participants before any canonical write.
- Make repeated payloads idempotent by comparing provider IDs and normalized content.
- Preserve the previous canonical score when a malformed or incomplete response arrives.
- Record status transitions and corrected final scores so forecast runs remain auditable.

## Validation And Rollout

### Fixture Validation

Fetch the World Cup 2026 fixture list from API-Football without writing canonical changes. Verify:

- Expected competition and season.
- Stable fixture and team IDs.
- All returned kickoff times parse as timezone-aware timestamps.
- Venue and round coverage.
- Compatibility with the existing local fixture mapping workflow.

### Shadow Test

For at least one scheduled-to-final match lifecycle, collect sanitized API-Football responses and compare them with Sportmonks or another trusted match source. Measure:

- Kickoff and participant agreement.
- Status transition timing.
- Score and goal-event completeness.
- Final-result corrections.
- Missing or duplicated events.
- Actual daily request consumption.

API-Football becomes primary only after the fixture dry run and shadow lifecycle pass. Sportmonks configuration remains available during this validation window but is not extended with new product features.

### Rollback

Provider choice must remain configuration-driven. If API-Football returns incomplete World Cup data, the worker can stop writes and retain the last canonical Supabase state while the previous adapter or a manual reconciliation path is used.

## Testing

- Client tests for authentication headers, query parameters, timeouts, HTTP failures, and rate-limit metadata.
- Parser tests using sanitized fixture, live-score, event, extra-time, penalty, postponed, and cancelled payloads.
- Mapping tests for stable fixture and team identity.
- Idempotency tests for repeated live payloads and duplicated events.
- Transition tests for scheduled to live to final and for corrected final results.
- Budget tests proving that low remaining quota suppresses optional calls before final reconciliation.
- CLI tests for fixture discovery and dry-run output without canonical writes.
- Existing Supabase writer and tournament-engine regression suites.

## Security And Licensing

- Store the API-Football key only in the private ingestion runtime.
- Never use a `NEXT_PUBLIC_` variable for a sports provider key.
- Do not commit keys, raw production payloads, or provider credentials.
- Keep the public application behind canonical Supabase reads and RLS.
- Do not assume that an API subscription grants rights to publish competition branding, team logos, or other protected assets.
- Before a public production launch, confirm the intended display and redistribution rights with the provider and avoid FIFA branding assets unless separately licensed.

## Documentation Updates During Implementation

Implementation should also update:

- The live ingestion design to identify API-Football as the selected primary provider.
- The worker environment example and README with API-Football configuration.
- CLI usage for fixture discovery, dry runs, and mapping import.
- Deployment documentation with the free-plan polling limitation and upgrade path.
- The provider comparison and shadow-test result after live validation.

## References

- API-Football pricing: https://www.api-football.com/pricing
- API-Football World Cup 2026 guide: https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
- API-Football documentation: https://www.api-football.com/documentation
- API-Football terms: https://www.api-football.com/terms
- KickoffAPI World Cup 2026: https://kickoffapi.com/world-cup-2026-api.html
- football-data.org pricing: https://www.football-data.org/pricing
