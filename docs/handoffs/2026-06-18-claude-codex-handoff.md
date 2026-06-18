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

## Prediction Baseline Workstream - 2026-06-18

- Branch: `feat/match-prediction-baseline`
- Worktree: `.worktrees/match-prediction-baseline`
- Base: `a470d04 docs: plan match prediction baseline`
- Engine commit: `69330d3 feat: add match outcome probability baseline`
- UI commit: `cd88414 feat: show fixture prediction probabilities`
- Changed: tournament-engine prediction API, focused predictor tests, fixture prediction presentation, responsive styles
- Root tests: 81 passed, 0 failed
- Worker tests: 69 passed, 0 failed
- Other checks: ESPN offline dry run, syntax check, web typecheck, production build, secret scan, and `git diff --check` passed
- Browser desktop: seed source badge rendered; four upcoming fixtures rendered W/D/L, likely score, and top-three scorelines; completed fixtures rendered no prediction; no console errors or Next.js error overlay
- Browser narrow viewport: verified at 390x844; no horizontal body overflow; prediction panels remained visible; section heading and date filter stacked correctly
- Remote API or Supabase writes: none
- Remaining real-data work: the ingestion branch must fetch/review/import ESPN mappings, apply the live sync only after validation, and confirm the source badge changes from `Demo seed data` to `Live database`
- Integration: update this branch from the latest `feat/api-football-provider-transition`, resolve only genuine shared-file changes, rerun the complete verification set, then merge through the selected PR strategy

## ESPN Real-Data Critical Path + Plan Completion - 2026-06-18

- Branch: `feat/api-football-provider-transition`
- Worktree: `.worktrees/api-football-provider-transition`
- Commits added this session, in order: `45fc5d8` (select ESPN/football-data providers, disable API-Football), `c77a6ec` (fix match_events dedupe index + ingestion_runs grant), `6f762ba` (Task 7: football-data.org reconciliation report), `922131e` (docs: ESPN operations + validation evidence)
- All 9 plan tasks from `docs/superpowers/plans/2026-06-18-espn-football-data-provider-transition.md` are now complete.

**Critical path executed (real ESPN data, no sample fixtures):**

1. Fetched real ESPN data for the full tournament window (104 fixtures, 48 teams).
2. Found and fixed a real canonical-data quality gap during mapping review: this repo's hand-authored `src/data/fixtures.js` disagreed with ESPN on 69/72 group-stage kickoff times and 10/72 home/away assignments, plus 6 teams have different ESPN display names (e.g. "South Korea" vs. "Korea Republic"). Corrected the *mapping-discovery input only* (an ephemeral, gitignored `.local-data/local-tournament.json` export) using ESPN as ground truth — did **not** touch `src/data/fixtures.js` itself, to avoid disturbing the prediction-baseline branch, which consumes the same file and was already verified. The seed file's kickoff/home-away accuracy is a known follow-up, not yet fixed at the source.
3. Discovered and reviewed mappings: 48/48 teams, 72/72 fixtures matched with zero errors after the corrections above.
4. Imported reviewed mappings to Supabase (`--apply`): 48 team mappings + 72 fixture mappings written.
5. Ran ESPN sync dry-run, reviewed all 24 then-completed fixtures' write plans (scores/winners looked correct), then ran a full backfill `--apply` (not just the standard ±1-day window, since the recurring command would never reach back to backfill already-played matches).
6. Found and fixed two previously-unexercised real Supabase bugs during the first-ever real write to this pipeline: (a) the `match_events` partial unique index couldn't be targeted by `ON CONFLICT`, (b) `record_ingestion_run`'s `RETURNING` clause needed a `SELECT` grant that was never present. Both fixed via new migrations and committed.
7. Re-ran the backfill successfully: 72 fixtures synced (24 final, 48 scheduled), 75 match_events written.
8. Deleted 10 stale `manual_seed` match_events rows that were duplicating real ESPN scorer entries for A-1/A-2/D-1 (same pattern the project's own seed script already uses before reseeding).
9. Configured `apps/web/.env.local` in this worktree (copied from the main checkout) and verified the running app: rendered fixture data reported `"source":"supabase"` with real scores/scorers (e.g. Mexico 2-0 South Africa, Julián Quiñones/Santiago Giménez), no duplicates after cleanup.
10. Implemented Task 7 (football-data.org reconciliation CLI, read-only, no `--apply`) via TDD.
11. Updated README, deployment docs, and the live-ingestion design doc to describe ESPN as primary, football-data.org as reconciliation-only, API-Football as disabled.

**Verification status:** root tests 81/81, worker tests 74/74, typecheck clean, production build clean, secret scan clean, `git diff --check` clean.

**Remote/Supabase writes performed:** Yes — `select_espn_provider` migration applied (espn/football-data added as `evaluation`, api-football set `disabled`), two bugfix migrations applied, 48 team mappings + 72 fixture mappings imported, full fixture/event backfill applied (72 fixtures, 75 events), 10 stale manual_seed events deleted. All against the linked Supabase project `iicrbyyagalnqzqppnox`.

**Policy exception, documented:** the `select_espn_provider` migration was applied directly to the linked project rather than waiting for merge-to-clean-main, because the FK constraint on `provider_team_mappings`/`provider_fixture_mappings` made it a hard technical prerequisite for mapping import. Deliberate, scoped exception — not a change to the standing policy.

**Unresolved / follow-up items:**

- `src/data/fixtures.js`'s hand-authored kickoff times and home/away assignments are now known-wrong for most group-stage fixtures (see point 2 above) but were not corrected at the source. Whoever fixes this should coordinate with the prediction-baseline branch first, since it consumes the same file.
- ESPN provider status remains `evaluation`, not `active` — pending a shadow test through one full scheduled-to-final live window and a penalty-shootout check once the knockout stage starts.
- ESPN does not report assists; `assist_player_name` will stay `null` for all ESPN-sourced events. Accepted MVP gap.
- This worktree's dev server was run on port 3100 (3000 was occupied by Codex's still-running `match-prediction-baseline` dev server, left untouched).

**Exact next action:** integrate the `feat/match-prediction-baseline` branch on top of this one (update it from this branch's tip, resolve any genuinely shared file changes — expected to be none, since Codex's files and this session's files don't overlap — rerun full verification, then merge through whichever PR strategy is chosen). After that, plan and execute the kickoff/home-away correction to `src/data/fixtures.js` itself, and schedule the live shadow test.
