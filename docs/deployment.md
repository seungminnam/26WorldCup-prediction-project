# Deployment

## Recommended Order

1. Push this repository to GitHub.
2. Import the GitHub repository into Vercel.
3. Configure Vercel as a monorepo project.
4. Add Supabase environment variables after the database is created.

## Vercel Project Settings

Use these settings when importing the GitHub repository through the Vercel dashboard:

- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** leave default

The app depends on the local workspace package at `../../packages/tournament-engine`, so keep the repository layout intact.

For CLI deployments from the repository root, `vercel.json` runs the workspace build and points Vercel at `apps/web/.next`.

## Current Commands

From the repository root:

```bash
npm install
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

From `apps/web` in Vercel:

```bash
npm run build
```

## Environment Variables

The deployed web app reads public tournament data from Supabase. Configure only browser-safe values in Vercel for the Next.js app:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not expose provider API tokens, the Supabase service role key, database URL, database password, or any other secret to browser code. In Next.js, variables prefixed with `NEXT_PUBLIC_` are bundled for the client, so keep that prefix limited to browser-safe Supabase values.

Future ingestion workers should store private secrets only in the worker host's secret manager. They should not be added to this repository, `.env.example`, or Vercel client-facing configuration.

## Private Ingestion Worker Secrets

The ingestion worker must be deployed separately from the public Next.js client. Store these values only in the worker host's secret manager:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_FOOTBALL_API_KEY=
```

Do not prefix these values with `NEXT_PUBLIC_`. Do not commit them to `.env`, `.env.example`, Vercel project settings for the browser app, or any checked-in config file.

Before configuring real provider credentials, validate mapping payloads locally:

```bash
npm run ingestion:mapping-dry-run
```

This command uses sanitized sample data and performs no network calls or database writes.

To fetch a private API-Football fixture payload into the gitignored local data directory:

```bash
npm run ingestion:fetch-api-football-fixtures -- \
  --date-from 2026-06-11 \
  --date-to 2026-06-11 \
  --output .local-data/api-football/fixtures-2026-06-11.json
```

The command loads `API_FOOTBALL_API_KEY` from `apps/ingestion-worker/.env.local`, never prints the key, and writes raw provider data only under `.local-data/`. Start with a one-day range to confirm plan coverage before requesting a larger tournament window.

To validate a real mapping file without writing to Supabase:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json
```

To generate a mapping file from a local tournament snapshot and a sanitized provider fixture payload:

```bash
npm run ingestion:discover-mappings -- \
  --local-file path/to/local-tournament.json \
  --provider-file .local-data/api-football/fixtures-2026-06-11.json
```

API-Football is the default discovery provider. Sportmonks remains available only as an explicit fallback by passing its provider ID, name, and base URL.

To apply a reviewed mapping file, run from a private worker environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured as secrets:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json --apply
```

After reviewed API-Football mappings exist in Supabase, run one live request in dry-run mode:

```bash
npm run ingestion:sync-api-football-live
```

The command fetches the competition-scoped live feed, loads mappings, and prints canonical write plans without changing fixture or event rows. Only a controlled private worker may enable writes:

```bash
npm run ingestion:sync-api-football-live -- --apply
```

The private host scheduler owns the interval. On the free plan, invoke the command every 8-10 minutes only from 15 minutes before kickoff until the fixture is final. Keep at least 10 of the 100 daily calls in reserve. When the CLI reports `quotaState: "reserve"`, stop optional polling and prioritize final-result reconciliation.

## API-Football Validation Gate

Current status: **Not run: `API_FOOTBALL_API_KEY` required.**

Before changing the provider status from `evaluation` to `active`, record and review:

- Fixture count and World Cup 2026 competition/season identity.
- Home/away participant and kickoff agreement with canonical fixtures.
- Venue and round coverage.
- Scheduled, live, half-time, extra-time, penalty, and final status transitions.
- Goal scorer, assist, own-goal, and penalty-event completeness.
- Final-result correction behavior.
- Maximum observed delay and total daily request use.
- Display and redistribution rights for the intended public data.

Do not weaken mapping rules to force a match. Fix canonical data or provider aliases explicitly. Raw validation payloads remain under `.local-data/` and must never be committed.

The provider-selection migration is reviewed in the feature PR but, following the repository migration policy, is applied to the linked project only after merge from a clean `main`. Local Supabase lint was not run while the local stack was unavailable; CI or the clean-main release step must perform database verification before applying the migration.

## GitHub

Until `gh` is re-authenticated, create the GitHub repository manually or run:

```bash
gh auth login -h github.com
gh repo create 26WorldCup-prediction-project --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if this is ready to be a public portfolio repository.
