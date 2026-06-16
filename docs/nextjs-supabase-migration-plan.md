# Next.js + Supabase Migration Plan

## Goal

Move the static MVP into a production-ready Next.js App Router structure while keeping the tournament engine reusable and adding a Supabase-backed data layer.

## Target Structure

```text
apps/web/
  app/
    page.tsx
    fixtures/page.tsx
    standings/page.tsx
    bracket/page.tsx
    forecast/page.tsx
  components/
    match-centre/
    standings/
    bracket/
    forecast/
  lib/
    supabase/
    tournament/
packages/
  tournament-engine/
supabase/
  schema.sql
```

## Migration Steps

1. Scaffold `apps/web` with Next.js App Router, TypeScript, Tailwind, and Vercel-ready scripts.
2. Move `src/engine` into `packages/tournament-engine`.
3. Convert static data modules into seed scripts and Supabase tables.
4. Rebuild current HTML/CSS UI as React components.
5. Add Supabase read layer for teams, fixtures, match events, and forecast snapshots.
6. Keep Monte Carlo simulation client-side for MVP, then move heavy simulation runs to a server route or background job.
7. Add Python model pipeline later as a separate `models/` workspace that writes ratings or forecast snapshots into Supabase.

## Data Policy

The app must clearly distinguish:

- verified final results
- scheduled fixtures
- result-pending fixtures
- simulated outcomes

No generated or placeholder result should look like an official final score.

## Deployment

- Vercel hosts `apps/web`.
- Supabase stores tournament state and forecast snapshots.
- Python jobs can run locally first, then move to scheduled CI or a worker platform.
