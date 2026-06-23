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

Add both variables to the **Production** and **Preview** environments. Preview deployments without them fall back to the demo schedule, so completed matches appear as upcoming even though the Supabase results are intact. After changing environment scopes, redeploy the affected preview before validating its data-source badge.

Do not expose provider API tokens, the Supabase service role key, database URL, database password, or any other secret to browser code. In Next.js, variables prefixed with `NEXT_PUBLIC_` are bundled for the client, so keep that prefix limited to browser-safe Supabase values.

Future ingestion workers should store private secrets only in the worker host's secret manager. They should not be added to this repository, `.env.example`, or Vercel client-facing configuration.

## Private Ingestion Worker Secrets

The ingestion worker must be deployed separately from the public Next.js client. Store these values only in the worker host's secret manager:

```text
FOOTBALL_DATA_API_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not prefix these values with `NEXT_PUBLIC_`. Do not commit them to `.env`, `.env.example`, Vercel project settings for the browser app, or any checked-in config file. ESPN itself needs no credential — it is a keyless public endpoint.

Before configuring real provider credentials, validate mapping payloads locally:

```bash
npm run ingestion:mapping-dry-run
```

This command uses sanitized sample data and performs no network calls or database writes.

To fetch the real ESPN fixture and team list into the gitignored local data directory:

```bash
npm run ingestion:fetch-espn-fixtures -- \
  --date-from 2026-06-11 \
  --date-to 2026-07-19 \
  --fixtures-output .local-data/espn/fixtures-full.json \
  --teams-output .local-data/espn/teams-full.json
```

No key is required. ESPN has no documented daily request cap, so the full tournament window can be fetched in one call.

To generate a mapping file from a local tournament snapshot and the fetched ESPN payloads:

```bash
npm run ingestion:discover-mappings -- \
  --local-file path/to/local-tournament.json \
  --provider-file .local-data/espn/fixtures-full.json \
  --provider-teams-file .local-data/espn/teams-full.json
```

ESPN is the default discovery provider. `--provider-teams-file` filters out knockout fixtures whose slots are still unresolved placeholders (e.g. "Group A 2nd Place"); omit it only if you want every fixture including placeholders. API-Football and Sportmonks remain available only as explicit fallbacks by passing their provider ID, name, and base URL — API-Football's free plan no longer covers the active World Cup season, so it is `disabled` in `data_providers`.

To validate a real mapping file without writing to Supabase:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json
```

To apply a reviewed mapping file, run from a private worker environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured as secrets:

```bash
npm run ingestion:import-mappings -- --file path/to/provider-mappings.json --apply
```

After reviewed ESPN mappings exist in Supabase, run a live sync in dry-run mode:

```bash
npm run ingestion:sync-espn-live
```

The command polls a ±1-day window around the current date, loads mappings, and prints canonical write plans without changing fixture or event rows. Only a controlled private worker may enable writes:

```bash
npm run ingestion:sync-espn-live -- --apply
```

For the free production path, prefer an external HTTP scheduler such as cron-job.org over Vercel Cron on Hobby. Configure it to call:

```text
GET https://<production-domain>/api/cron/sync-espn
Authorization: Bearer <CRON_SECRET>
```

Use a 5-minute interval. The route itself is the smart gate: it only runs ESPN + Supabase writes from 30 minutes before a canonical fixture kickoff until 3 hours after kickoff. Outside that window it returns `mode: "skip"` with the next sync window and does not call ESPN or Supabase. This keeps the scheduler simple and free while avoiding unnecessary provider and database work between matches.

Set these production environment variables on the web deployment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must stay server-only; never expose either as `NEXT_PUBLIC_...`. GitHub Actions remains available as a manual fallback, but scheduled GitHub workflows are not reliable enough to be the only near-live trigger and should not duplicate the external 5-minute scheduler.

To cross-check canonical fixtures against the official football-data.org source without writing anything:

```bash
npm run ingestion:compare-football-data -- --date-from 2026-06-18 --date-to 2026-06-25
```

This command requires `FOOTBALL_DATA_API_TOKEN` (free signup at football-data.org) and only prints a status/score agreement report. football-data.org's World Cup response has no goal-event data, so it can never be a source for `match_events` and has no `--apply` flag.

## ESPN Validation Gate

Status: **Run on 2026-06-18.** A full backfill sync (`--apply`) was performed covering the entire tournament window fetched so far (72 group-stage fixtures, fixture IDs A-1 through L-6).

- Fixture count and competition identity: 104 fixtures returned for `league=fifa.world`, season 2026 (matches the known 104-match World Cup format); 72 of those correspond to this repository's currently-seeded group-stage fixtures.
- Home/away participant and kickoff agreement: ESPN disagreed with this repository's hand-authored seed data on 69/72 kickoff timestamps and 10/72 home/away assignments. This was a defect in the seed data (it was always a manual placeholder, see `src/data/fixtures.js`'s own source-note), not an ESPN data-quality issue. Per the "fix canonical data, don't weaken matching" rule, the mapping-discovery input was corrected using ESPN as ground truth rather than relaxing the matcher; the committed `src/data/fixtures.js` kickoff/home-away values were intentionally left untouched to avoid disturbing the in-flight, already-verified prediction-baseline branch, which consumes the same data. The seed file's kickoff/home-away accuracy remains a known follow-up.
- Team naming: ESPN uses different display names than this repository for six teams (e.g. "South Korea" vs. "Korea Republic", "Ivory Coast" vs. "Cote d'Ivoire", "Cape Verde" vs. "Cabo Verde", "Iran" vs. "IR Iran", "Bosnia-Herzegovina" vs. "Bosnia and Herzegovina"). All 48 teams mapped successfully once these aliases were applied during mapping discovery.
- Status transitions observed: `scheduled` and `final` both observed and applied correctly (24 final, 48 scheduled at time of writing). `live`, `result_pending`, and `postponed` were not exercised because no match was in progress or disrupted during this validation.
- Goal-event completeness: 75 goal/card events written across the 24 final fixtures, with scorer name and minute (including stoppage-time minutes). ESPN does not report assists — `assist_player_name` is always `null` for ESPN-sourced events. This is an accepted MVP gap, not a defect.
- Penalty shootouts: not yet exercised — the tournament is still in the group stage, so no shootout has occurred. Re-verify `home_penalties`/`away_penalties`/`winner_team_id` once the knockout rounds begin.
- Final-result correction: not separately tested in this pass; re-running `sync-espn-live --apply` is idempotent (`match_events` dedupes on `source, source_event_id`) and safe to use for corrections.
- Request volume: no daily cap observed or applicable; 5 rapid sequential calls during initial verification all returned in under 0.25s with no throttling.
- Display/redistribution rights: ESPN's endpoint is unofficial and undocumented (reverse-engineered from espn.com), acceptable for this personal, non-commercial portfolio project. Re-confirm licensing posture before any public launch announcement or commercial use.
- Two real, previously-unexercised Supabase schema bugs were found and fixed during this validation (see migrations `20260618140319_fix_match_events_dedupe_index.sql` and `20260618140436_grant_ingestion_runs_select.sql`): a partial unique index could not be targeted by `ON CONFLICT`, and `record_ingestion_run`'s `RETURNING` clause needed a `SELECT` grant that was never present.
- UI confirmation: the match centre at `apps/web` was run locally against this data with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured; the rendered fixture data reported `"source":"supabase"` and showed real scorelines and scorer names (e.g. Mexico 2-0 South Africa, scorers Julián Quiñones and Santiago Giménez) rather than the static seed fallback.

Decision: `espn` remains `evaluation` rather than `active` pending a shadow test through at least one scheduled-to-final match lifecycle during an actual live window, and re-verification once a knockout-stage penalty shootout occurs. The provider-selection migration (`20260618135649_select_espn_provider.sql`) has already been applied to the linked Supabase project directly, ahead of the repository's normal "merge to main first" migration policy, because the FK constraint on `provider_team_mappings`/`provider_fixture_mappings` made it a hard prerequisite for mapping import — this is a deliberate, documented exception, not a policy change.

## GitHub

Until `gh` is re-authenticated, create the GitHub repository manually or run:

```bash
gh auth login -h github.com
gh repo create 26WorldCup-prediction-project --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if this is ready to be a public portfolio repository.
