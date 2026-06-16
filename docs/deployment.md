# Deployment

## Recommended Order

1. Push this repository to GitHub.
2. Import the GitHub repository into Vercel.
3. Configure Vercel as a monorepo project.
4. Add Supabase environment variables after the database is created.

## Vercel Project Settings

Use these settings when importing the GitHub repository:

- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** leave default

The app depends on the local workspace package at `../../packages/tournament-engine`, so keep the repository layout intact.

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

No environment variables are required for the current static/forecast MVP.

Later Supabase integration should add:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not expose the service role key to browser code.

## GitHub

Until `gh` is re-authenticated, create the GitHub repository manually or run:

```bash
gh auth login -h github.com
gh repo create 26WorldCup-prediction-project --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if this is ready to be a public portfolio repository.
