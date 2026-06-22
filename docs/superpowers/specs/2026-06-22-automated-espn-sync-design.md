# Automated ESPN Sync Design

## Goal

Actually run `sync-espn-live --apply` on a recurring schedule so canonical fixture/score/event data stays current without manual intervention, and make the sync resilient to individual unmapped fixtures so a single gap (e.g. an unresolved knockout slot) can't halt the whole run.

## Context

The ESPN provider transition shipped a fully working, tested `sync-espn-live` CLI, but nothing was ever deployed to actually invoke it on a schedule. Every update to canonical data so far has come from a human manually running the CLI. This was discovered when a user noticed several already-finished group-stage matches (Belgium 0-0 Iran, New Zealand 1-3 Egypt, Spain 4-0 Saudi Arabia, Uruguay 2-2 Cape Verde) still showed `scheduled`/no score days after they were played — because no scheduler had ever actually been running.

A related, separately-discovered bug was fixed directly in Supabase during this same investigation: `fixtures.kickoff_at` and, for 10 fixtures, `home_team_id`/`away_team_id` still held the original hand-authored seed values, never reconciled against ESPN. That data has now been corrected for all 72 group fixtures via a one-time SQL correction. This design is about the recurring automation gap only — not the kickoff/home-away correction, which is already done.

## Decision

Run `sync-espn-live --apply` on a GitHub Actions scheduled workflow. This repository is public, so Actions minutes are unlimited and free. The workflow runs the existing, already-tested Node CLI directly (`npm ci && npm run ingestion:sync-espn-live -- --apply`) — zero rewrite, 100% of the existing tested code path is reused as-is.

Alternatives considered and rejected:
- **Supabase Edge Functions + pg_cron** — also free, but Edge Functions run on Deno, which would mean reimplementing the sync logic in a different runtime instead of reusing the existing Node CLI. Not worth the duplication.
- **Cloudflare Workers Cron Triggers** — same problem: free, but a different runtime requiring a rewrite.
- **Vercel Cron (Hobby/free plan)** — limited to one invocation per day on the free tier, far too infrequent for near-live score updates.

## Schedule And Concurrency

- Cron: `*/15 * * * *` (every 15 minutes), matching the polling cadence already specified in this project's ESPN provider design doc. GitHub's scheduler is best-effort and can lag by a few minutes under load; that's an acceptable trade for a free, zero-infrastructure scheduler at this cadence.
- Also trigger on `workflow_dispatch` so a sync can be forced on demand (useful for exactly the kind of manual catch-up this investigation needed).
- `concurrency: { group: sync-espn-live, cancel-in-progress: true }` so an overlapping run (e.g. the 15-minute cron firing again before a slow previous run finished) cancels the stale one instead of both running against the database at once.

## Secrets

Two GitHub Actions repository secrets, set once via `gh secret set`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

ESPN itself needs no credential. These are injected as workflow-step environment variables, never logged, never written to a file checked into the repo.

## Resilience: Skip Unmapped Fixtures Instead Of Aborting

`runSyncEspnLive` currently does `fixtures.map((fixture) => buildLiveScoreUpsertPlan(fixture, mappings))` — if any single ESPN fixture has no corresponding row in `provider_fixture_mappings` (most likely scenario: a knockout-stage slot that just resolved to real teams but hasn't been mapped yet), `buildLiveScoreUpsertPlan` throws and the entire run aborts, including all the other fixtures that would have synced fine.

Change this to a per-fixture try/catch: build each plan individually, collect successes into `plans` and collect `{ providerFixtureId, error }` into a new `skipped` array for ones that fail to map. Continue applying the successful plans. Include `skipped` in the returned summary (and in `recordIngestionRun`'s metadata) so a skipped fixture is visible in the ingestion run log, not silently lost. This only changes the mapping-lookup failure path — a real apply failure (e.g. a Supabase write error) for an already-successfully-mapped fixture should still propagate and fail the run, since that's a genuine operational problem worth surfacing loudly rather than swallowing.

## Non-Goals

- No Slack/email/other failure notification — GitHub Actions' own UI (failed run shows as a red X in the Actions tab) is enough for a project this size. Add real alerting only if silent failures actually become a problem.
- No automatic mapping discovery/import for newly-resolved knockout fixtures. Skipping them gracefully (this design) buys time; someone still has to run `discover-mappings`/`import-mappings` for each new knockout round before those specific fixtures start syncing. Automating that step is out of scope here.
- No change to the football-data.org reconciliation CLI's schedule — it stays a manual/occasional check, not automated.
