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
SPORTMONKS_API_TOKEN=
```

Do not prefix these values with `NEXT_PUBLIC_`. Do not commit them to `.env`, `.env.example`, Vercel project settings for the browser app, or any checked-in config file.

Before configuring real provider credentials, validate mapping payloads locally:

```bash
npm run ingestion:mapping-dry-run
```

This command uses sanitized sample data and performs no network calls or database writes.

To validate a real mapping file without writing to Supabase:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json
```

To generate a mapping file from a local tournament snapshot and a sanitized provider fixture payload:

```bash
npm run ingestion:discover-mappings -- \
  --local-file path/to/local-tournament.json \
  --provider-file path/to/sportmonks-fixtures.json
```

To apply a reviewed mapping file, run from a private worker environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured as secrets:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json --apply
```

## GitHub

Until `gh` is re-authenticated, create the GitHub repository manually or run:

```bash
gh auth login -h github.com
gh repo create 26WorldCup-prediction-project --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if this is ready to be a public portfolio repository.
