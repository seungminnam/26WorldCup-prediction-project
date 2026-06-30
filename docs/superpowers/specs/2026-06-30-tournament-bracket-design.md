# Tournament Bracket — Real Results + Model Predictions Design

## Goal

Replace the Bracket tab's current "Projected Bracket" (a single Monte Carlo sample path) with a live "Tournament Bracket" that shows real confirmed results and model predictions together in a single tree — so users can see what's actually happened AND what the model predicts for upcoming matches without switching views, and can still check what the model originally predicted even after a match is decided.

## Context

Today the Bracket tab renders `forecast.sampleBracket.rounds` — a single randomly-sampled knockout path from the Monte Carlo simulation. Once a match is played, its real result doesn't automatically appear here; users have to go to the Fixtures tab. There's no way to see the model's pre-match prediction alongside the real result in one place.

## Decision

**Single unified bracket tree (C+)** — the same visual tree, SVG connectors, and column-per-round layout already on the Bracket tab, but sourced from real Supabase fixture data with four match-card states:

| State | When | What shows |
|---|---|---|
| **FT** | Match played, real score recorded | Real teams + real score. Compact prediction row: "Model: CAN 71% ✓". Click expands full probability bar + top scorelines. |
| **Upcoming** | Both teams known, match not yet played | Real teams. Compact prediction row: "Model: NED 58% · Likely 2-1". Click expands same detail. |
| **Half-resolved** | One team confirmed, other slot not yet determinable | One real team shown with flag. Other team shows human-readable slot label (e.g. "Best 3rd · Groups A B C D F"). No model prediction until both teams are known. |
| **Pending** | Neither team known yet (W##/L## awaiting upstream match) | Both shown as readable slot labels. Greyed slightly. No prediction. |

**Headline change:** "Projected Bracket / Sample scores from the latest forecast" → "Tournament Bracket / Results + model predictions"

**Bracket tab now shows without a forecast run.** Real results don't require Monte Carlo. Model predictions use `predictMatch(homeTeam, awayTeam, { isNeutralVenue: true })` directly, same as Fixtures tab already does — no simulation needed.

## Slot Resolution (Client-Side)

The DB's `home_team_id`/`away_team_id` columns are null until the backend cron resolves them (from PR #23/#24). But the client already has all the data needed to derive partial assignments:

- `homeSlot: "1E"` + Group E is finished → homeTeam = Germany (from current standings in the fixture list)
- `homeSlot: "W73"` + M73 is finished → homeTeam = winner of M73 (from `winnerTeamId`)
- `awaySlot: "3 ABCDF"` + not all 12 groups done yet → awayTeam still unknown

A new **`buildActualBracketMatches(fixtures, teams)`** pure function (extracted to its own file for testability) takes the full real fixture list + team list and returns `{ [round: string]: ActualBracketMatch[] }` — one entry per knockout fixture, organized by round, with:
- `homeTeamId`/`awayTeamId`: real value if determinable client-side, null otherwise
- `homeDisplay`/`awayDisplay`: human-readable string for display when null (`"1st place · Group E"`, `"Best 3rd · Groups A B C D F"`, `"Winner of M73"`, `"Loser of M89"`)
- `homeGoals`/`awayGoals`: from real fixture data if played
- `winnerTeamId`: from real fixture data if played
- `wentToPenalties`: true if `homePenalties` or `awayPenalties` is non-null

**Human-readable slot label rules:**
- `"1A"` → `"1st place · Group A"`
- `"2B"` → `"2nd place · Group B"`
- `"3 ABCDF"` → `"Best 3rd · Groups A B C D F"`
- `"W73"` → `"Winner of M73"`
- `"L84"` → `"Loser of M84"`

## Prediction Row (FT + Upcoming states)

- Always computed client-side via `predictMatch(homeTeam, awayTeam, { isNeutralVenue: true })` — all knockout matches are at neutral venues.
- Compact row (always visible): `[flag] homeWin% | draw% | [flag] awayWin%` on one line, PLUS a result indicator for FT matches: ✓ (model favored the actual winner) or ✗ (upset).
- Expanded state (click on match card): full probability bar (home | draw | away) + top-3 most-likely scorelines with percentages. Same detail currently shown in Fixtures tab's pre-match prediction, just adapted for knockout context (no draw in practice, but model still assigns a draw probability from the score-distribution math).
- Click/collapse toggles a `Set<number>` of expanded match IDs in component state — same pattern as `expandedFinishedGroups` from the Standings tab's finished-group cards.

## What Stays Unchanged

- SVG connector drawing (`drawBracketConnectors`) and its `useEffect` trigger
- `bracketRoundMeta` (interval/offset grid positioning for each round)
- `roundOrder = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"]`
- Third-place match rendering (separate section below the main tree), now also sourced from real fixture data
- The Forecast tab — unaffected
- The Fixtures tab — unaffected

## Components

- **New file `apps/web/lib/bracket-data.ts`**: `buildActualBracketMatches` pure function + `readableSlotLabel` utility. Extracted here for testability (the rest of this codebase already has the pattern of testing plain functions in `apps/web/test/`).
- **`apps/web/components/match-centre/match-centre-app.tsx`**: replaces the `forecast?.sampleBracket.rounds` usage in the Bracket section with `actualBracketRounds` (computed from `buildActualBracketMatches`), changes the section heading/subtitle, adds `expandedBracketMatches` state, and rewrites the `bracket-match` article to render the four match-card states.
- **`apps/web/app/globals.css`**: new styles for the compact prediction row, expanded prediction panel, half-resolved/pending card visual treatment.

## Testing

- `buildActualBracketMatches` and `readableSlotLabel`: unit tests in `apps/web/test/bracket-data.test.js` — verified against synthetic fixtures covering all four card states, including the half-resolved case (one slot known, one still pending).
- No component-rendering tests (consistent with the rest of `match-centre-app.tsx`).
- Manual verification: run the dev server, navigate to Bracket tab, confirm all four card states render correctly against real live data, confirm click-expand works, confirm the tab shows correctly even without running a forecast first.

## Non-Goals

- No change to how group-stage Fixtures cards show/hide predictions (that's a separate "predicted vs actual" comparison question for group matches, not this spec).
- No restructuring of the Monte Carlo simulation or `sampleBracket` shape — they're still used by the Forecast tab and can still be used elsewhere; we're just adding a new real-data path.
- No re-implementing the SVG connector drawing.
- No backend changes — client-side slot derivation is a display enhancement only; the backend cron (PR #24) continues to write real team IDs to the DB as matches conclude.
