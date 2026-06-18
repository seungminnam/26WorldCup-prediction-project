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

1. Replace synthetic teams and fixtures with official group data, including correcting the hand-authored kickoff times and home/away assignments now known to disagree with ESPN (see the ESPN Validation Gate in [docs/deployment.md](docs/deployment.md)).
2. Add locked-result editing in the UI for snapshot mode.
3. Add the official Annex C third-place assignment table.
4. Complete the ESPN scheduled-to-final shadow validation and penalty-shootout verification once the knockout stage begins.
5. Add What-if mode for custom result scenarios.
