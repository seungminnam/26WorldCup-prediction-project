# Git Workflow

## Goals

This repository is public and deployed to production from Vercel, so the workflow optimizes for:

- No accidental secrets in Git history.
- No direct production changes from local work.
- Small, reviewable changes.
- Clear separation between application code, database migrations, and provider credentials.
- A portfolio-grade history that shows engineering discipline.

## Branch Model

Use trunk-based development with a protected `main` branch.

- `main`
  - Production branch.
  - Always deployable.
  - No direct pushes after this workflow is adopted.
  - Receives changes only through reviewed pull requests.
- `feat/<scope>`
  - Human-authored product feature branches.
  - Examples: `feat/provider-mapping-import`, `feat/live-sync-worker`.
- `fix/<scope>`
  - Bug fixes and production corrections.
- `docs/<scope>`
  - Documentation-only changes.
- `chore/<scope>`
  - Tooling, dependency, and repository maintenance.

Keep branches short-lived. Prefer one coherent product or infrastructure change per branch.

## Pull Request Rules

Every PR should include:

- Summary of user-facing or system-facing changes.
- Security notes when Supabase, ingestion, deployment, or secrets are involved.
- Test evidence copied from local commands or CI.
- Vercel preview link for UI changes.
- Supabase migration notes for database changes.

Required local checks before opening a PR:

```bash
npm test
npm run ingestion:test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run ingestion:dry-run
npm run ingestion:mapping-dry-run
```

For documentation-only changes, `npm test` and secret scanning are still required. Build/typecheck can be skipped only when the PR touches no executable code, package metadata, Vercel config, or Supabase files.

## CI Requirements

GitHub Actions should run on every PR and every push to `main`:

- Install dependencies with `npm ci`.
- Run the root test suite.
- Run ingestion worker tests.
- Run web typecheck.
- Run Next.js production build.
- Run a conservative secret pattern scan.

CI must pass before merge.

## Supabase Rules

Supabase has production data implications, so treat migrations as release artifacts.

- Commit migrations in a feature branch.
- Review the migration SQL in PR.
- Keep RLS enabled on public tables.
- Use `security_invoker = true` for public views.
- Never commit DB passwords, service role keys, provider tokens, connection strings, or local Supabase temp files.
- Do not apply production migrations from unreviewed local changes.

Recommended migration flow:

1. Create migration locally with `npx supabase migration new <name>`.
2. Add SQL and mirror it in `supabase/schema.sql`.
3. Run local tests and secret scan.
4. Open PR.
5. After PR approval and merge, apply migration to the linked Supabase project from a clean `main`.
6. Run `npx supabase db advisors --linked`.

If an urgent production migration is needed, document the reason in the PR and verify advisors immediately after applying it.

## Vercel Rules

- `main` maps to production.
- Feature branches map to Vercel preview deployments.
- Do not promote a preview deployment unless its commit is merged or explicitly approved.
- Keep browser-safe variables as `NEXT_PUBLIC_*`.
- Store private worker secrets only in the worker host secret manager, not in Vercel client-facing config.

## Secret Handling

This is a public repository. Treat all commits as permanent.

Never commit:

- `.env` files.
- `.vercel/`.
- `supabase/.temp/`.
- Supabase service role keys.
- Database URLs or passwords.
- Sportmonks or other provider tokens.
- Raw licensed provider payload dumps.

Allowed in Git:

- Browser-safe Supabase publishable key names.
- Empty placeholder names without values.
- Sanitized sample payloads created for tests.

Before every commit touching deployment, Supabase, ingestion, or package files, run:

```bash
npm run secret:scan
```

Expected result: no matches.

## Merge Strategy

Use squash merge for feature branches unless commit-by-commit history matters.

Squash titles should follow:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`

Delete feature branches after merge.

## Current Policy

From this point forward:

- No direct pushes to `main` for feature work.
- All new implementation starts from a branch.
- Branch names should be portfolio-readable and should not expose implementation tooling.
- Production DB writes and private provider credentials require an explicit human approval step.
