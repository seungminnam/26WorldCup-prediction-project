# FIFA Tiebreaker Criteria Design

## Goal

Replace the documented MVP simplification ("points, goal difference, goals for, then rating") with FIFA's actual published World Cup 2026 tiebreaker criteria, for both within-group standings and best-third-place selection.

## Context

`packages/tournament-engine/src/engine/ranking.js`'s `compareRows` currently orders tied teams by: points → goal difference (all matches) → goals for (all matches) → `rating` (this project's own internal Elo-style predictor strength, not an official ranking) → team ID. `README.md` already documents this as an accepted MVP shortcut. `selectBestThirdPlaceTeams` (`thirdPlace.js`) reuses the same comparator.

FIFA's official criteria, confirmed against fifa.com and cross-referenced via ESPN's published explainer:

**Within a group, teams level on points** (in order):
1. Points in head-to-head matches among the tied teams
2. Goal difference in those head-to-head matches
3. Goals scored in those head-to-head matches
4. (if still tied) Goal difference across all group matches
5. Goals scored across all group matches
6. Team conduct ("fair play") score
7. FIFA World Ranking position

**Best eight third-place teams across all 12 groups** (no head-to-head possible — different groups never play each other):
1. Points
2. Goal difference (all group matches)
3. Goals scored (all group matches)
4. Team conduct score
5. FIFA World Ranking position

Three independent gaps close this out: head-to-head resolution (pure algorithm, data we already have), conduct score (needs card events, which ESPN provides but this project doesn't currently capture), and FIFA World Ranking (a real external attribute the `teams` table doesn't have at all — `rating` is a different, internally-assigned number used by the win-probability predictor).

## Decision

### 1. Head-to-head resolution

FIFA's text applies head-to-head criteria once, as a single mini-league among the full set of teams tied on points — it does not recurse further into smaller sub-groups if a partial tie remains. This matches the standard mini-league procedure historically used to resolve real World Cup ties.

`rankGroup` changes signature to `rankGroup(rows, matches)`. Algorithm:
1. Cluster `rows` into groups sharing equal points (preserving points-descending cluster order).
2. Within each cluster of 2+ teams: build a head-to-head mini-table using only `matches` played between cluster members (same shape as `buildGroupTable`'s output, just scoped to a smaller match list and team set). Sort the cluster by (mini points, mini goal difference, mini goals for).
3. Within that sort, any remaining tie falls through to the same trailing comparator already used for cross-group comparison: all-matches goal difference, all-matches goals for, conduct score, FIFA ranking, team ID.

`selectBestThirdPlaceTeams` keeps using that trailing comparator directly (head-to-head never applies — confirmed third-place teams never share a group).

### 2. Conduct ("fair play") score

ESPN's raw event data already exposes `yellowCard`/`redCard` boolean flags (confirmed during the original ESPN integration work), and the Supabase `match_events.event_type` enum already includes `yellow_card`/`red_card` — the schema anticipated this from the start, ingestion just never populated it. `espn.js`'s `normalizeEvents` currently keeps only `scoringPlay === true` details; it will also keep card details, emitting `eventType: "yellow_card"` or `"red_card"`.

Scoring: yellow card = −1, red card = −4, per FIFA's published deduction scale. `conductScore` is the sum of these (zero or negative; zero means no cards). Like points/goal-difference/goals-for, a higher (less negative) `conductScore` is better, so it sorts descending in the same direction as the rest of the chain — only `fifaRanking` sorts ascending (lower position number is the better ranking).

**Known accepted limitation:** ESPN's event data does not reliably distinguish a second-yellow-card dismissal (FIFA: −3 total) from a straight red card (FIFA: −4). This implementation will sum the yellow (−1) and red (−4) flags independently, so a second-yellow dismissal will compute as −5 instead of FIFA's −3. This only changes the outcome in the vanishingly rare case where fair-play score is the deciding criterion at that exact margin — documented, not blocking.

Card events flow the same path goals already do: `tournament-data.ts`'s `match_events` query adds `yellow_card`/`red_card` to its `event_type` filter; `tournament-data-core.ts`'s `mapFixtureRows` splits events into the existing `scorers` array (goal-type only, unchanged) and a new `cards` array (`{ teamId, player, minute, eventType }`) per fixture. `buildGroupTable` sums each team's card deductions across its matches into a new `conductScore` field on the row, the same way it already sums `goalsFor`/`goalsAgainst`. Matches with no `cards` field (e.g. synthetic simulator-generated matches) contribute zero deduction — conduct score only ever differentiates real, played matches, which is correct since we don't simulate disciplinary records.

### 3. FIFA World Ranking

One-time static snapshot, not a live sync — matches how `rating` itself originated, and matches FIFA's own practice of freezing the ranking used for seeding purposes well before a tournament rather than updating it mid-event. Add a `fifa_ranking` column to `teams` (migration, backfilled with each team's current published FIFA Men's World Ranking position, sourced once at implementation time) and add the same field to the static fallback data in `packages/tournament-engine/src/data/teams.js`, mirroring exactly how `rating` already exists in both places. Lower number = better ranking, so the comparator sorts ascending on this field (opposite direction from every other criterion in the chain).

## Components

- `packages/tournament-engine/src/engine/ranking.js` — `buildGroupTable` gains a `conductScore` field per row (summed from each match's `cards`, defaulting to nothing contributed when absent). New `buildHeadToHeadTable` (scoped version of the existing aggregation logic). `rankGroup(rows, matches)` implements the cluster-then-resolve algorithm above. The trailing/fallback comparator (today's `compareRows`, minus `rating` and plus `conductScore` then `fifaRanking`) stays exported for `thirdPlace.js` to reuse directly.
- `packages/tournament-engine/src/engine/thirdPlace.js` — `selectBestThirdPlaceTeams` switches from the old `compareRows` to the new trailing comparator (same one `rankGroup` falls through to).
- `apps/ingestion-worker/src/provider/espn.js` — `normalizeEvents` also emits card events.
- `apps/web/lib/tournament-data.ts` — `match_events` query adds `yellow_card`/`red_card` to its `event_type` filter.
- `apps/web/lib/tournament-data-core.ts` — `mapFixtureRows` builds a `cards` array per fixture alongside the existing `scorers` array.
- `packages/tournament-engine/src/data/teams.js` — each team gains a `fifaRanking` field.
- New Supabase migration — `teams.fifa_ranking` column, backfilled.
- `README.md` — the "Current MVP Limits" line describing the old simplified tiebreakers gets updated to describe the real criteria now implemented.

## Testing

- `ranking.js`: head-to-head resolution with a 2-team tie, a 3-team tie that head-to-head fully resolves, a 3-team tie that head-to-head only partially resolves (one pair still tied, falls through to all-matches goal difference), and the existing simple no-tie case.
- `thirdPlace.js`: confirms the third-place comparator never depends on a head-of-head path (teams from different groups), and resolves a conduct-score tie via FIFA ranking.
- `espn.js`: a fixture whose `details` include a yellow card and a red card alongside goals produces `yellow_card`/`red_card` events with the same id-construction convention already used for goals.
- `tournament-data-core.test.js`: `mapFixtureRows` separates a mixed goal+card event list into `scorers` and `cards` correctly.

## Non-Goals

- No live-syncing FIFA World Ranking — one-time snapshot only.
- No attempt to distinguish second-yellow dismissals from straight reds — documented limitation above.
- No UI surfacing of conduct score or FIFA ranking as their own visible columns in this pass — they only affect sort order. Surfacing them visibly in the standings table is a separate, future product decision.
