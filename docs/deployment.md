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

## GitHub

Until `gh` is re-authenticated, create the GitHub repository manually or run:

```bash
gh auth login -h github.com
gh repo create 26WorldCup-prediction-project --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if this is ready to be a public portfolio repository.
