# World Cup 2026 Match Centre

A portfolio project that combines a live tournament dashboard with an interactive prediction model.

## What It Does

- Displays the canonical 104-match World Cup schedule with local-time kickoff display.
- Syncs live and final results from ESPN while protecting FIFA-owned fixture metadata.
- Shows fixtures, results, group standings, knockout slots, and scoring events from Supabase.
- Adds rating and Poisson-based pre-match predictions directly to fixture cards.
- Runs Monte Carlo tournament simulations and aggregates advancement and title probabilities.
- Provides team drill-downs so the model remains explorable rather than a hidden backend feature.

## Run Static MVP

```bash
npm test
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

## Run Next.js App

```bash
npm install
npm run web:dev
```

Open:

```text
http://127.0.0.1:3000
```

Build check:

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

## Development Workflow

This public repository uses short-lived branches and pull requests. Do not push feature work directly to `main`.

See [docs/git-workflow.md](docs/git-workflow.md) for the branch strategy, CI requirements, Supabase migration rules, and secret-handling policy.

## Current MVP Limits

- ESPN is treated as an evaluation feed rather than a betting-grade real-time service.
- The current prediction model is a transparent rating and Poisson baseline, not a trained production model.
- The group ranking engine implements FIFA's published tiebreaker criteria: head-to-head points/goal-difference/goals-scored among tied teams, then all-matches goal difference, goals scored, team conduct score, and FIFA World Ranking. FIFA World Ranking is a one-time pre-tournament snapshot, not live-synced. Card-based conduct scoring cannot distinguish a second-yellow dismissal from a straight red card with ESPN's data, so it is scored as the sum of both deductions.
- The forecast is not yet recomputed automatically after every result update.
- Production live writes are flowing from ESPN; a shadow test through a full scheduled-to-final match lifecycle and knockout-stage penalty-shootout verification are still pending before flipping the provider from `evaluation` to `active`.

## ESPN Ingestion

The private ingestion worker uses ESPN's public, keyless scoreboard endpoint as the World Cup 2026 primary source — no API key, no subscription, no documented daily request cap. football-data.org (official, free-tier-eligible) is wired in as a read-only reconciliation check only, because its World Cup response has no goal-event data. API-Football and Sportmonks are both `disabled`: API-Football's free plan does not cover the active World Cup season at all, and Sportmonks is paid.

Since ESPN has no quota to conserve, the intended schedule is a fixed 10-15 minute poll at all times, not just during match windows.

Useful offline checks:

```bash
npm run ingestion:test
npm run ingestion:dry-run
npm run ingestion:mapping-dry-run
```

Credentialed fetch, sync, and reconciliation commands are documented in [docs/deployment.md](docs/deployment.md). Real ESPN data has already been fetched, mapped, and applied to the linked Supabase project (see the ESPN Validation Gate section there for what was verified and what remains).

## Suggested Next Steps

1. Recompute snapshot forecasts after result changes and show feed/forecast freshness.
2. Refine the matchday dashboard with live emphasis, recent results, and model highlights.
3. Add model evaluation, backtesting, and a documented path beyond the Poisson baseline.
4. Complete the ESPN scheduled-to-final shadow validation and knockout penalty-shootout verification.
5. Add the official Annex C third-place assignment table and What-if scenarios.
