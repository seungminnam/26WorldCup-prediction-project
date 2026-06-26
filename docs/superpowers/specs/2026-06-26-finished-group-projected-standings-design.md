# Collapsed Cards For Finished Groups In Projected Group Tables

## Goal

Once a group's 6 matches are all complete, the Monte Carlo simulation has no randomness left for that group (every simulated match for it is a real-score passthrough), so the "Projected Group Tables" panel on the Standings tab shows numbers that are byte-for-byte identical to the "Current tables" panel right next to it — a pointless full-table duplication for every finished group, growing to all 12 groups by the end of the group stage.

## Decision

For each group in the Projected Group Tables grid, determine whether it's finished: all of that group's fixtures have `status === "FT"` with finite `homeGoals`/`awayGoals` (the same predicate `completedFixtures` already uses for the "Current tables" panel).

- **Unfinished groups:** render exactly as today — the full `ProjectedStandingTable`.
- **Finished groups:** render a collapsed one-line card by default ("✓ Group X · Finished — see Standings for the final table"), with a button to expand it inline into the same `ProjectedStandingTable` as before. Collapsed is the default; expansion state is per-group and resets on page reload (no persistence needed).

This replaces the earlier "hide the group/panel entirely" idea — a panel that visibly shrinks to nothing by the end of the tournament would make users wonder where their group went. Every group stays visible in the grid for the whole tournament; finished ones just take less space by default.

No special-case "hide the whole panel" logic is needed: since every group always renders *something* (a full table or a collapsed card), the grid is never empty as long as a forecast has been run at least once. The existing empty-grid behavior (no forecast run yet) is unaffected.

**Out of scope:** comparing what the model predicted for a group *before* it finished against the real outcome. `groupProjections` is recomputed fresh on every forecast run with no history kept, so "what did we predict when this was still uncertain" isn't answerable today — it would need a separate prediction-history/snapshot feature, which is a meaningfully bigger scope than this change and not part of it.

**Unaffected:** the "Current tables" panel (always real results, this change doesn't touch it) and the Forecast tab's per-team "Sample finish" drill-down (round-of-32/16/QF/etc. advancement odds aren't shown anywhere in Current Standings, so they're not redundant for a finished group the way the group table is).

## Components

- `apps/web/components/match-centre/match-centre-app.tsx`:
  - New `completedGroupSet: Set<string>` — `useMemo` over `fixtures`, computing per-group total fixture count vs. completed-fixture count (reusing the existing `completedFixtures` predicate) and including a group iff the two counts are equal and nonzero.
  - New `expandedFinishedGroups: Set<string>` — `useState`, starts empty (all finished groups start collapsed). A toggle function adds/removes a group id.
  - The Projected Group Tables grid's `.map` over `projectedStandings` branches per group: if `rows[0].group` is in `completedGroupSet`, render a new `FinishedGroupCard` component (passing `rows`, `teamsById`, whether it's expanded, and the toggle callback); otherwise render `ProjectedStandingTable` exactly as today.
  - New `FinishedGroupCard` component: collapsed state is a single-line button-like element with the group label and a "Finished" indicator; clicking it toggles expansion. Expanded state renders the same one-liner (now indicating "expanded", e.g. a rotated chevron) followed by the existing `ProjectedStandingTable` for that group's `rows`.

## Testing

`apps/web/components/match-centre/match-centre-app.tsx` has no existing tests of its own, and `apps/web/test/` only contains plain-logic `.test.js` files (no React rendering/component-test setup exists in this codebase). This change follows that same convention: extract the new logic into pure, exported helper functions and unit-test those, rather than introducing component-rendering test infrastructure as a side effect of this change.

- `computeCompletedGroups(fixtures): Set<string>` (pure function, exported for testing): a group with all 6 fixtures `FT` and finite scores is included; a group with 5/6 complete is not; a group with 0/6 complete is not; non-group (knockout) fixtures mixed into the input are ignored and don't affect any group's count.
- The expand/collapse toggle is a one-line `Set` add/remove with no branching logic worth a dedicated unit test on its own; it's exercised implicitly through manual verification (see below) rather than a unit test.
- Manual verification (no automated render test, per the above): with the dev server running and at least one group manually completed in the seed/demo data, confirm the finished group renders collapsed by default, expands on click to show the same table as before, and an unfinished group is unaffected (always shows the full table, no toggle UI).
