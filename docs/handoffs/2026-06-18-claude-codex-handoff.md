# Claude / Codex Handoff - 2026-06-18

## Shared Objective

Have real World Cup schedule/results flowing to the match-centre UI and a clearly labeled W/D/L plus scoreline prediction baseline before the 2026-06-19 group-stage matches begin.

## Repository State At Handoff

- Shared base worktree: `.worktrees/api-football-provider-transition`
- Shared base branch: `feat/api-football-provider-transition`
- Base commit: `0b8fd25 feat: add ESPN live sync command`
- ESPN transition Tasks 1-6 are committed.
- Fresh verification on 2026-06-18: root tests 76/76, worker tests 69/69, ESPN dry run, TypeScript, Next.js build, secret scan, and `git diff --check` passed.
- ESPN transition Tasks 7-9 are not complete.
- The ESPN transition branch has no remote upstream and includes earlier Sportmonks/API-Football transition history.
- `apps/ingestion-worker/.env.local` exists locally; `apps/web/.env.local` was absent in this worktree at the time of inspection.

## Codex Ownership

Codex works on `feat/match-prediction-baseline` in `.worktrees/match-prediction-baseline` after this documentation checkpoint:

- pure rating/Poisson match prediction API
- W/D/L and likely-score unit tests
- compact fixture prediction UI
- visible `supabase` versus `seed` source badge
- typecheck, build, and browser verification

Expected primary files:

- `packages/tournament-engine/src/engine/predictor.js`
- tournament-engine exports and tests
- `apps/web/components/match-centre/match-centre-app.tsx`
- related UI styles if required

Codex does not modify ingestion provider, mapping, sync, Supabase migration, or deployment-documentation files in this parallel branch.

Branch and commit names must describe the feature only. Do not include `codex`, `claude`, or any other agent/tool identity in them. Follow the repository's existing `feat:`, `fix:`, `test:`, and `docs:` commit style.

## Claude Ownership After Session Reset

Claude should not start with reconciliation Task 7. Prioritize the real-data critical path:

1. Fetch the real ESPN fixtures and teams for the active date window.
2. Compare them with the canonical tournament export and review mappings.
3. Import only reviewed mappings.
4. Run ESPN sync without `--apply` and inspect the write plans.
5. Run `--apply` only after participant, kickoff, status, and score agreement.
6. Configure/confirm the web Supabase public environment and verify real data in the UI.
7. Return to reconciliation Task 7 and provider migration Task 8 after the critical path is working.

Claude should avoid the Codex-owned engine and match-centre files until the Codex branch is merged.

## ML Decision

Do not describe tonight's output as a trained ML model. The repository has no versioned historical training dataset, chronological holdout, or calibration pipeline. Tonight's deliverable is an explicit baseline that can later be used as the benchmark for a trained model.

The external 11-model comparison is a research input, not an implementation checklist. Preserve its strongest ideas: one normalized W/D/L output contract, simple baselines, chronological validation, and visible model uncertainty. Do not add complex classifiers until they beat the baseline on held-out probability metrics.

## Update Protocol

At every Claude/Codex switch, update this document with:

- branch and commit
- files changed
- commands run and their result
- unresolved blockers
- exact next action
- whether any remote API or Supabase write was performed

Never record tokens, keys, project secrets, or raw credentialed output.
