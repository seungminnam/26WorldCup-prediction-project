# Real Knockout Slot Resolution

## Goal

Once a World Cup group's matches finish, the Round-of-32 bracket fixtures that depend on that group (e.g. `1A`/`2A`) should show the real qualifying teams instead of permanent placeholder labels like "2A". Today nothing ever does this: the engine has a complete, tested slot-resolution algorithm (group ranking, best-8-of-12 third place selection, FIFA Annex C assignment, `W##`/`L##` cascade for later rounds), but it's wired only into the browser's ephemeral Monte Carlo forecast — never into the real, persisted `fixtures` table. So the Fixtures tab shows placeholder slot labels indefinitely, no matter how many real matches finish.

## Decision

### Where the algorithm lives

The resolution algorithm is a new exported function in `packages/tournament-engine/src/engine/bracket.js`, alongside the existing `buildRoundOf32`/`simulateKnockout` (which already contain nearly all the pieces — group ranking via `rankAllGroups`, third-place selection via `selectBestThirdPlaceTeams`, Annex C lookup via `resolveThirdPlaceAssignments`). Putting it here means the actual algorithm is testable in isolation and reusable, with no duplication between `apps/web` (which already uses the sibling Monte Carlo functions) and `apps/ingestion-worker` (which will use this new one against real data).

`resolveRealKnockoutSlots(teamList, matches)`:
- `matches` is the FULL real fixture list (group + knockout), in the engine's existing camelCase shape (`homeTeamId`, `awayTeamId`, `homeGoals`, `awayGoals`, `homeSlot`, `awaySlot`, `status`, `winnerTeamId`, `matchNumber`, `group`/`stage`).
- For each group, compute its ranking via `rankAllGroups` — but only trust a group's ranking once ALL of its matches have real, finite scores (a partial table mid-group is not a valid ranking for slot purposes). Resolve `1{group}`/`2{group}` slots for any group that's fully finished.
- Once ALL 12 groups are fully finished, compute the best-8-of-12 third-place teams (`selectBestThirdPlaceTeams`) and resolve the `3 XXXXX`-style slots via the existing Annex C table (`resolveThirdPlaceAssignments`).
- Walk the knockout fixtures in match-number order (Round of 32 → Final). For each one: if its `homeSlot`/`awaySlot` is a group-stage reference (`1A`, `2B`, `3 ABCDF`, etc.), resolve it against the slot map built above. If it's a `W##`/`L##` reference, resolve it against the REAL `winnerTeamId` of match `##` if that match has already finished — the loser is just "whichever of that match's two real teams isn't the winner." Because the schedule's match numbers are already ordered so a `W##`/`L##` reference only ever points at an earlier match number, a single forward pass resolves every round that's currently resolvable, cascading naturally (Round of 16 becomes resolvable in the same pass once Round of 32 has real winners, etc.).
- Return only the matches whose `homeTeamId`/`awayTeamId` were previously `null` and are now resolved — i.e., the function reports exactly what's newly knowable, and is safe to call repeatedly as more results come in (idempotent: it never touches a match that's already resolved, and matches that still can't resolve yet are simply absent from the result).

### Where the sync lives

Mirrors the existing `apps/ingestion-worker/src/sync/espn-results.js` / `apps/ingestion-worker/src/cli/sync-espn-results.js` split exactly:

- `apps/ingestion-worker/src/sync/resolve-knockout-slots.js`:
  - `buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows })` — pure, testable. Maps the snake_case Supabase rows (`home_team_id`, `group_code`, `winner_team_id`, etc.) into the engine's camelCase shape, calls `resolveRealKnockoutSlots`, and converts the result into a plan: an array of `{ id, homeTeamId, awayTeamId }` updates (using the fixture's database `id`, not its match number) ready to write.
  - `resolveKnockoutSlots({ teamRows, fixtureRows, writer })` — async; builds the plan, then calls a new `writer.applyResolveKnockoutSlotsPlan(plan)` for each entry (one `.update({ home_team_id, away_team_id }).eq("id", ...)` per resolved fixture, mirroring the existing single-row `applyLiveScorePlan` pattern in `supabase-writer.js` rather than a bulk upsert, since this also makes each write independently inspectable in logs).
- `apps/ingestion-worker/src/storage/supabase-writer.js` gains two additions:
  - A new read function, `loadAllFixturesAndTeams()`, selecting the full column set the resolver needs (`id, match_number, group_code, stage, home_team_id, away_team_id, home_slot, away_slot, status, home_goals, away_goals, winner_team_id` from `fixture_cards`; `id, name, group_code, rating, fifa_ranking` from `teams`) — the existing `loadCanonicalFixtures`/`loadTeamNamesById` select too few columns for this purpose and are used elsewhere for narrower needs, so this is a new function rather than widening those.
  - `applyResolveKnockoutSlotsPlan(plan)` — applies one resolved-fixture update, returning `{ fixtureId, homeTeamId, awayTeamId }` for logging.
- `apps/ingestion-worker/src/cli/resolve-knockout-slots.js` — thin orchestrator: load teams+fixtures via the writer, call `resolveKnockoutSlots`, print the resolved-matches summary as JSON, exit non-zero only on a thrown error (there's no "rejected" concept here the way ESPN sync has, since this isn't reconciling against a third-party feed).

This is manually triggered (`node apps/ingestion-worker/src/cli/resolve-knockout-slots.js`), matching the project's established preference for manual triggers over automated cron for this class of operation (the same choice made for model retraining earlier). Re-running it is always safe — it only ever fills in currently-`null` slots, never changes an already-resolved one.

### Migration fix

`supabase/migrations/20260618154700_canonicalize_world_cup_schedule.sql`'s seed `INSERT ... ON CONFLICT (id) DO UPDATE SET home_team_id = excluded.home_team_id, ...` unconditionally resets every knockout row's `home_team_id`/`away_team_id`/`home_slot`/`away_slot` back to the original placeholder values on any re-run. Since this migration could in principle run again (migrations aren't guaranteed one-shot in every environment), this would silently undo every slot this feature resolves. Fix: change those four columns in the `DO UPDATE SET` clause to `coalesce(fixtures.home_team_id, excluded.home_team_id)` (and the symmetric form for the other three), so a re-run still seeds genuinely-missing rows but never clobbers a value that's already been resolved.

## Testing

- `resolveRealKnockoutSlots`: synthetic team list + match list covering — a fully-finished group resolves its 1st/2nd slots; a group with one unplayed match resolves nothing for that group; once all 12 (synthetic) groups finish, third-place slots resolve via a synthetic Annex-C-style scenario; a Round-of-16 match resolves once its two Round-of-32 source matches have real `winnerTeamId`s; calling the function twice in a row on the same data returns an empty result the second time (idempotency); a match that's already fully resolved (real, non-null team IDs) is never touched or re-emitted.
- `buildResolveKnockoutSlotsPlan`: confirms the snake_case→camelCase mapping is correct and that the returned plan entries use the fixture's database `id` (not its `match_number`) as the update key.
- Migration fix: no automated test (this project's migrations aren't run in the test suite), but manually verified by re-running the migration locally against a database with one resolved knockout row and confirming it survives.

## Non-Goals

- No automated/scheduled re-running of this resolver — manual CLI only, consistent with this project's existing preference for manual triggers over cron for non-time-critical operations.
- No UI changes in this spec — once slots resolve in the database, the Fixtures tab will display real team names automatically (it already falls back to `homeSlot`/`awaySlot` only when `homeTeamId`/`awayTeamId` are null, so resolving the latter is sufficient). Building knockout-match prediction UI (win probability / likely score on bracket match cards) is a separate, already-identified follow-up project that depends on this one.
