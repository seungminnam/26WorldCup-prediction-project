# World Cup 2026 Tournament Lab

Browser-based MVP for simulating a 48-team World Cup-style tournament.

## What It Does

- Runs Monte Carlo tournament simulations.
- Calculates group tables from simulated or locked scores.
- Selects group winners, runners-up, and the best eight third-place teams.
- Builds a 32-team knockout bracket.
- Aggregates probabilities for Round of 32, Round of 16, quarterfinal, semifinal, final, and champion.
- Lets users click any team for a drill-down view.

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

- The seed dataset is manually maintained from public schedule references and must be replaced by Supabase-backed verified data before production.
- The group ranking engine uses MVP tie-breakers: points, goal difference, goals for, then rating.
- The Round of 32 assignment is an MVP-safe unique-slot mapping. A FIFA Annex C lookup table should replace it for official compliance.
- Production live writes are not enabled until API-Football fixture mapping and shadow validation pass. Locked results remain available for manual snapshots.

## API-Football Ingestion

The private ingestion worker now uses API-Football as the World Cup 2026 primary candidate. Provider credentials stay server-side, fixtures and events are normalized before Supabase writes, and Sportmonks remains a disabled fallback adapter during validation.

The free API-Football plan allows 100 requests per day, so the intended MVP schedule is one competition-scoped poll every 8-10 minutes during known match windows with at least 10 calls reserved for retries and final-result reconciliation. The public app should describe this as near-live rather than real time.

Useful offline checks:

```bash
npm run ingestion:test
npm run ingestion:dry-run
npm run ingestion:mapping-dry-run
```

Credentialed fetch and sync commands are documented in [docs/deployment.md](docs/deployment.md). Do not use `--apply` until fixture mappings and one scheduled-to-final shadow test have been reviewed.

## Suggested Next Steps

1. Replace synthetic teams and fixtures with official group data.
2. Add locked-result editing in the UI for snapshot mode.
3. Add the official Annex C third-place assignment table.
4. Complete the API-Football fixture and scheduled-to-final shadow validation.
5. Add What-if mode for custom result scenarios.
