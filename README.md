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

## Current MVP Limits

- The seed dataset is manually maintained from public schedule references and must be replaced by Supabase-backed verified data before production.
- The group ranking engine uses MVP tie-breakers: points, goal difference, goals for, then rating.
- The Round of 32 assignment is an MVP-safe unique-slot mapping. A FIFA Annex C lookup table should replace it for official compliance.
- Live score API updates are not included yet. Locked results can be added manually to fixture objects.

## Suggested Next Steps

1. Replace synthetic teams and fixtures with official group data.
2. Add locked-result editing in the UI for snapshot mode.
3. Add the official Annex C third-place assignment table.
4. Add What-if mode for custom result scenarios.
