# ESPN + football-data.org Provider Transition Design

## Goal

Replace API-Football as the primary World Cup 2026 data source. API-Football's free plan was empirically confirmed to reject the 2026 season (`"Free plans do not have access to this season, try from 2022 to 2024."`), so it cannot satisfy the zero-cost requirement at all, regardless of polling strategy. Move to a combination that is empirically verified to work at $0:

- **ESPN's undocumented public scoreboard API** (`site.api.espn.com`) as the primary source for fixtures, teams, status, scores, and goal/card events.
- **football-data.org's official free tier** as a secondary, lower-depth source used for reconciliation only (no canonical writes), because its free tier exposes fixtures/scores/status but not goal events.

## Context And Evidence

Verified by direct, credentialed calls during this session (2026-06-18, tournament in Group Stage):

| Check | API-Football Free | ESPN (no key) | football-data.org Free |
|---|---|---|---|
| 2026 season access | ❌ `"Free plans do not have access to this season"` | ✅ | ✅ (WC listed as a Free-tier competition) |
| Full 104-fixture schedule | N/A (blocked) | ✅ (`limit=200` returns 104) | not re-verified at full scale, but `/competitions/WC/matches` works |
| 48-team master list | N/A | ✅ (`/teams` returns 48) | not used |
| Goal scorer + minute | N/A | ✅ (66/66 finished-match goals had scorer + minute) | ❌ (confirmed absent from both list and single-match detail responses) |
| Assists | N/A | ❌ (0/66 goals had a second `athletesInvolved` entry) | N/A |
| Cards / own goal / penalty flags | N/A | ✅ (`redCard`, `yellowCard`, `ownGoal`, `penaltyKick` booleans) | N/A |
| Rate limiting observed | 100/day, season-gated anyway | none observed across 5 rapid calls | `x-requests-available-minute` header confirms 10/min |
| Auth | API key required | **none required** | free-signup token required |
| Official/licensed | Yes | **No — reverse-engineered, undocumented** | Yes |
| Penalty shootout fields | N/A | unverified (no knockout matches played yet) | unverified |

Other candidates investigated and rejected:
- **KickoffAPI** — could not find independent documentation or evidence of the claimed free WC2026 coverage.
- **rezarahiminia/worldcup2026** (GitHub, hosted at `worldcup26.ir`) — empirically dead: TLS handshake succeeds but the HTTP request hangs and times out with zero bytes. No disclosed upstream data source for its "real-time" claim. Single-maintainer hobby project. Rejected.
- **RapidAPI "Football News Aggregator Live"** — confirmed (via its own description) to be a news-headline scraper (Goal.com/OneFootball/ESPN/90mins), not a stats/results provider. Wrong tool entirely. Rejected.
- **Sofascore / FotMob hidden APIs** — both blocked basic unauthenticated access (403 / 404 on guessed IDs) during this session. Possibly viable with more reverse-engineering effort, but ESPN already works cleanly; not worth the investment now.
- **Wikipedia/Wikidata scraping** — officially low-risk (CC-BY-SA) but requires wikitext/template parsing and updates only when an editor edits the page. Not suitable as an automated primary or secondary source; could serve as a manual spot-check later, out of scope for this plan.

## Decision

- **Primary: ESPN** (`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world`). No API key. Used for fixtures, teams, status, score, and goal/card events. Canonical writes flow through this provider.
- **Secondary: football-data.org** (`https://api.football-data.org/v4`, competition code `WC`). Free signup token. Used only for a read-only reconciliation report (fixture/score/status diff against canonical data) — **never for canonical writes**, because it has no goal-event data to satisfy the PRD's "goalscorers" requirement.
- **API-Football**: set to `disabled` with a note that its free plan does not cover the active World Cup season. Client/normalizer code is kept (already working, already tested) in case a future paid upgrade or a different tournament season makes it viable again — same treatment Sportmonks already received.
- **Sportmonks**: remains `disabled` (unchanged, paid).

## Known Risk: ESPN Is Unofficial

`site.api.espn.com` is the backend ESPN's own website calls; it is not a published, documented, or licensed public API. Risk is judged acceptable for this project because:
- This is a personal portfolio project, not a commercial redistribution service.
- The existing provider-neutral architecture (client/normalizer/adapter separated from canonical storage) already isolates this risk — if ESPN ever blocks or changes shape, only `src/provider/espn-client.js` and `src/provider/espn.js` need to change.
- football-data.org remains wired in as an official fallback for the boring-but-essential parts (fixture existence, final score, status) if ESPN ever disappears mid-tournament.

This must be re-confirmed before any public launch announcement; it is acceptable for the current "verify it works end to end" goal.

## Polling Strategy

ESPN has no documented daily request cap (5 rapid sequential calls during verification all returned in <0.25s with no throttling), unlike API-Football's 100/day budget. This removes the need for quota-reservation logic (`quotaState: "reserve"`, etc.) that the API-Football design required.

Replace that with a simple **fixed-interval poll owned by the external scheduler**, per explicit user direction (periodic interval, not "check once after the match ends," since there is no quota to conserve):

- Poll the ESPN scoreboard for "today UTC ± 1 day" every **10-15 minutes**, at all times (not just during match windows) — there is no cost reason to restrict the window like the API-Football plan did.
- football-data.org reconciliation runs on a much slower cadence (e.g., once daily, or on demand) since it is a manual cross-check, not a live feed; this comfortably respects its 10 req/min limit.

## Handling Unresolved Knockout Slots

ESPN's scoreboard already returns all 104 fixtures, including not-yet-determined knockout slots (e.g., `"Group B 2nd Place at Group A 2nd Place"`). These have synthetic placeholder team IDs (e.g., `5926` for "Group A 2nd Place") that are not part of the real 48-team roster.

The normalizer must not error on these — it must filter them out before mapping discovery or sync ever sees them, using the real team-ID set fetched from `/teams`. They become syncable automatically once ESPN resolves the slot to a real team (which happens once the relevant group/bracket stage completes); no special "placeholder resolution" code is needed beyond the filter, since the next poll will simply see real team IDs once ESPN updates the slot.

## Canonical Data Contract (unchanged)

Reuses the existing provider-neutral contract already in place from the API-Football work — `providerFixtureId`, `providerLeagueId`, `providerSeasonId`, `kickoffAt`, `venue`, `round`, `elapsed`, `status` (`scheduled`/`live`/`result_pending`/`final`/`postponed`), `home`/`away` (`providerTeamId`, `name`, `code`, `goals`, `penalties`), and `events` (`providerEventId`, `providerTeamId`, `playerName`, `assistPlayerName`, `minute`, `stoppageMinute`, `eventType`). `buildLiveScoreUpsertPlan`, `discoverProviderMappings`, and the Supabase writer require **no changes** — they already operate on this contract regardless of provider.

`assistPlayerName` will always be `null` for ESPN-sourced events (the source does not report assists). This is an accepted MVP gap, not a bug.

## Testing

- Normalizer tests using sanitized fixtures captured from real ESPN/football-data responses during this session's verification (finished match, scheduled match, placeholder knockout slot, team list).
- Status-mapping table tests for both providers.
- Placeholder-fixture filtering test (mixed real + placeholder fixtures in one payload → only real ones survive).
- Client tests with injected `fetchImpl`, no real network calls in the test suite.
- Reconciliation diff tests for football-data.org (matched / score-mismatch / status-mismatch / unmatched cases).
- Existing Supabase writer, live-score, and mapping-discovery regression suites must stay green unmodified in contract.

## Security

- ESPN requires no credential, so there is nothing to leak for that provider.
- `FOOTBALL_DATA_API_TOKEN` follows the same rule as every other provider secret in this repo: private ingestion-worker runtime only, never `NEXT_PUBLIC_`, never committed.
- No change to the public app's read boundary — it still only ever reads canonical Supabase tables.
