# Official Knockout Bracket Design

## Goal

Render a projected bracket whose teams, match numbers, venues, and progression paths match the official FIFA World Cup 2026 knockout format for every match from M73 through M104.

## Sources of truth

- FIFA knockout-stage schedule: match numbers, fixed group positions, venues, and winner paths.
- FIFA official match-schedule PDF: independent confirmation of the same bracket graph and host cities.
- FIFA World Cup 26 Regulations, article 12 and Annex C: the 495 possible allocations for the eight best third-placed teams.
- `canonical-schedule.js`: the repository copy of the verified M73-M104 schedule metadata.

## Architecture

`canonical-schedule.js` remains the only repository source for knockout match numbers, stages, fixed slots, kickoff times, cities, and stadiums. A separate generated data module stores the 495 Annex C rows because those assignments are conditional on which eight groups produce the best third-placed teams.

The bracket engine resolves group-position slots from the same projected group tables displayed in the UI. It selects the Annex C row by the sorted set of qualifying third-place groups, resolves M73-M88, and then simulates M89-M104 by following `Wxx` and `Lxx` references from the canonical schedule. The third-place match is simulated for bracket completeness but remains outside the five-column championship path.

The web bracket renders the metadata returned by the engine. It does not maintain its own venue rotation, match numbering, or progression rules.

## Data flow

1. Group simulation produces ranked tables and the eight best third-place teams.
2. The Annex C lookup maps those eight groups to the eight group-winner matches that accept a third-place team.
3. Canonical M73-M88 slots resolve to team IDs.
4. Each knockout result is stored by match number.
5. Later matches resolve `Wxx` and `Lxx` from stored results.
6. The UI displays the engine match's official city, stadium, kickoff, match number, teams, and sampled score.

## Validation

- All 495 Annex C combinations must exist exactly once.
- Every Annex C row must use exactly the eight groups represented by its key and assign one team to each eligible winner slot.
- M73-M104 must match the canonical schedule's stage, slots, city, stadium, and dependency graph.
- A deterministic projected table must produce M75 as F1 v C2 in Monterrey.
- Every winner and loser reference must resolve to the corresponding earlier match result.
- Type checking, the full Node test suite, the production build, and a browser check of the bracket tab must pass.
