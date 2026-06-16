# World Cup Tournament Lab Design

## Goal

Build a browser-based 2026 World Cup tournament simulator that can run full-tournament forecasts without requiring a user to pick a team first. Team selection is a drill-down view, not the entry point.

## MVP Scope

The MVP provides a hybrid-ready simulation system:

- Pre-tournament style simulation: every match is generated from team ratings.
- Snapshot-ready simulation: completed results can be locked manually in fixture data.
- Full tournament simulation: group stage, best third-place qualification, round of 32, knockout rounds, and champion.
- Aggregated probabilities: round of 32, round of 16, quarterfinal, semifinal, final, and champion.
- Browser UI: run simulations, inspect probability table, view a generated bracket, and click a team for its path.

The MVP does not include live score APIs, authentication, databases, or advanced animation. Those are v2 concerns.

## Architecture

The project is a dependency-light static web app. Core tournament logic lives in small JavaScript modules under `src/engine`, seed data lives in `src/data`, tests live in `test`, and the browser UI lives in `public`.

The engine exposes pure functions so it can later move into a Next.js app without rewriting the modeling layer.

## Data Approach

The initial dataset is a synthetic 48-team tournament structure shaped like the 2026 format: 12 groups, 4 teams each, and 72 group fixtures. Real FIFA data can replace this dataset later without changing the engine contract.

Fixtures support optional locked scores. If a locked score exists, the simulator uses it instead of sampling a prediction.

## Rules Approach

Group ranking uses points, goal difference, goals for, and rating as the MVP tie-breaker. This is intentionally simpler than the full FIFA tie-breaker sequence.

Best third-place ranking uses the same comparison. The round of 32 assignment uses deterministic slot groups for the MVP, with a dedicated function boundary so a FIFA Annex C lookup table can replace it later.

## UI Approach

The first screen is the actual simulator:

- Controls for simulation count and mode.
- Probability table for all teams.
- Bracket snapshot from one generated tournament.
- Team details panel that appears after clicking a team.

The UI avoids requiring a favorite team upfront while still supporting team-focused exploration.

## Testing

Tests cover the core engine:

- Group table calculation.
- Best third-place selection.
- Knockout progression.
- Monte Carlo aggregation.

Manual verification covers the browser UI loading and running a simulation.
