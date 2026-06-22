# Automated ESPN Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `sync-espn-live --apply` automatically every 15 minutes via a GitHub Actions scheduled workflow, and make the sync resilient so one unmapped fixture (e.g. an unresolved knockout slot) can't abort the entire run.

**Architecture:** Harden `runSyncEspnLive` to catch per-fixture mapping failures and continue instead of throwing. Add a scheduled GitHub Actions workflow that runs the existing, unmodified-at-the-call-site `npm run ingestion:sync-espn-live -- --apply` command with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` injected as repository secrets. No new runtime, no rewrite of existing sync logic.

**Tech Stack:** Node.js ESM, Node built-in test runner, GitHub Actions (`schedule` + `workflow_dispatch` triggers), `gh` CLI for one-time secret setup.

## Global Constraints

- This repository is public; GitHub Actions minutes are unlimited and free for this use case.
- ESPN requires no credential. Only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are needed by the workflow.
- A real apply failure (a Supabase write error for a fixture that *did* map successfully) must still fail the run loudly — only mapping-lookup failures are caught and skipped.
- Cron interval: every 15 minutes (`*/15 * * * *`), matching this project's existing ESPN polling cadence.

---

## File Structure

- Modify `apps/ingestion-worker/src/cli/sync-espn-live-core.js`
  - `runSyncEspnLive` builds each fixture's upsert plan individually inside a try/catch instead of via a single `.map()`, collecting mapping failures into a new `skipped` array instead of letting one bad fixture abort the whole run.
- Modify `apps/ingestion-worker/test/sync-espn-live.test.js`
  - Replace the existing "rejects an unmapped provider fixture before any write" test (that behavior is changing) with one asserting the new skip-and-continue behavior, and add a mixed mapped+unmapped test.
- Create `.github/workflows/sync-espn-live.yml`
  - Scheduled (`*/15 * * * *`) and manually-triggerable (`workflow_dispatch`) workflow that checks out the repo, installs dependencies, and runs `npm run ingestion:sync-espn-live -- --apply` with the two Supabase secrets injected.
- No new GitHub Actions secrets need creating in code — they're set once via `gh secret set` (Task 3), not committed anywhere.

---

### Task 1: Make `runSyncEspnLive` Skip Unmapped Fixtures Instead Of Aborting

**Files:**
- Modify: `apps/ingestion-worker/src/cli/sync-espn-live-core.js`
- Modify: `apps/ingestion-worker/test/sync-espn-live.test.js`

**Interfaces:**
- Consumes: `buildLiveScoreUpsertPlan(fixture, mappings)` from `../sync/live-score.js` (unchanged — throws `Error("No local fixture mapping for espn:<id>")` when `mappings.fixtureByProviderId` has no entry for the fixture).
- Produces: `runSyncEspnLive(...)`'s returned summary now always includes a `skipped: Array<{ providerFixtureId: string, reason: string }>` field, and `recordIngestionRun`'s `metadata` argument now includes `{ skipped }`.

- [ ] **Step 1: Replace the now-incorrect existing test**

In `apps/ingestion-worker/test/sync-espn-live.test.js`, find this test (it currently asserts the old abort-on-first-failure behavior, which this task is changing):

```js
test("rejects an unmapped provider fixture before any write", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings: { fixtureByProviderId: new Map(), teamByProviderId: new Map() } });

  await assert.rejects(runSyncEspnLive({ argv: ["--apply"], client, store }), /No local fixture mapping/);
  assert.equal(store.applied.length, 0);
});
```

Replace it with:

```js
test("skips an unmapped provider fixture and continues instead of aborting", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings: { fixtureByProviderId: new Map(), teamByProviderId: new Map() } });

  const result = await runSyncEspnLive({ argv: ["--apply"], client, store });

  assert.equal(result.mode, "apply");
  assert.equal(result.fixtureCount, 0);
  assert.deepEqual(result.skipped, [
    { providerFixtureId: "760415", reason: "No local fixture mapping for espn:760415" }
  ]);
  assert.equal(store.applied.length, 0);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].status, "completed");
  assert.deepEqual(store.runs[0].metadata, { skipped: result.skipped });
});
```

- [ ] **Step 2: Add a mixed mapped-and-unmapped test**

Add this test to the same file, after the one from Step 1:

```js
test("applies mapped fixtures while skipping unmapped ones in the same run", async () => {
  const mixedScoreboard = {
    events: [
      ...scoreboard.events,
      {
        id: "760416",
        date: "2026-06-12T19:00Z",
        season: { year: 2026 },
        competitions: [
          {
            venue: { id: "1700", fullName: "Sample Arena" },
            altGameNote: "FIFA World Cup, Group A",
            status: { clock: 0, type: { name: "STATUS_SCHEDULED" } },
            competitors: [
              { homeAway: "home", score: "0", team: { id: "773", displayName: "Czechia", abbreviation: "CZE" } },
              { homeAway: "away", score: "0", team: { id: "774", displayName: "South Africa", abbreviation: "RSA" } }
            ],
            details: []
          }
        ]
      }
    ]
  };
  const mixedTeams = {
    sports: [
      {
        leagues: [
          {
            teams: [
              ...teams.sports[0].leagues[0].teams,
              { team: { id: "773", displayName: "Czechia", abbreviation: "CZE" } }
            ]
          }
        ]
      }
    ]
  };
  const client = buildClient(mixedScoreboard, mixedTeams);
  const store = buildStore({ mappings });

  const result = await runSyncEspnLive({ argv: ["--apply"], client, store });

  assert.equal(result.fixtureCount, 1);
  assert.deepEqual(result.fixtureIds, ["A-2"]);
  assert.deepEqual(result.skipped, [
    { providerFixtureId: "760416", reason: "No local fixture mapping for espn:760416" }
  ]);
  assert.equal(store.applied.length, 1);
});
```

This fixture (`760416`, Czechia vs South Africa) uses two real, already-`knownTeamIds`-resolved teams — it fails only because no row exists yet in `provider_fixture_mappings`, which is exactly the real-world failure mode this task defends against (an ESPN fixture whose teams are real but hasn't been mapped to a local fixture ID yet).

- [ ] **Step 3: Run the tests and verify RED**

```bash
node --test apps/ingestion-worker/test/sync-espn-live.test.js
```

Expected: FAIL — `result.skipped` is `undefined` because the implementation doesn't produce it yet, and the old rejection no longer happens to match the new assertions (the existing implementation still throws, so the new tests calling `await runSyncEspnLive(...)` directly, without `assert.rejects`, will fail with an unhandled rejection).

- [ ] **Step 4: Implement the skip-and-continue behavior**

In `apps/ingestion-worker/src/cli/sync-espn-live-core.js`, find:

```js
  const knownTeamIds = new Set(normalizeEspnTeams(teamsPayload).map((team) => team.providerTeamId));
  const fixtures = normalizeEspnPayload(scoreboardPayload, { knownTeamIds });
  const mappings = await store.loadProviderMappings("espn");
  const plans = fixtures.map((fixture) => buildLiveScoreUpsertPlan(fixture, mappings));

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id)
  };
```

Replace with:

```js
  const knownTeamIds = new Set(normalizeEspnTeams(teamsPayload).map((team) => team.providerTeamId));
  const fixtures = normalizeEspnPayload(scoreboardPayload, { knownTeamIds });
  const mappings = await store.loadProviderMappings("espn");

  const plans = [];
  const skipped = [];
  for (const fixture of fixtures) {
    try {
      plans.push(buildLiveScoreUpsertPlan(fixture, mappings));
    } catch (error) {
      skipped.push({ providerFixtureId: fixture.providerFixtureId, reason: error.message });
    }
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id),
    skipped
  };
```

Then find both `recordIngestionRun` calls:

```js
    await store.recordIngestionRun({
      source: "espn",
      status: "completed",
      rowsSeen: plans.length,
      rowsChanged,
      errorMessage: null,
      metadata: {}
    });
```

and:

```js
      await store.recordIngestionRun({
        source: "espn",
        status: "failed",
        rowsSeen: plans.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: {}
      });
```

Replace `metadata: {}` with `metadata: { skipped }` in both places.

- [ ] **Step 5: Run the tests and verify GREEN**

```bash
node --test apps/ingestion-worker/test/sync-espn-live.test.js
```

Expected: all tests pass, including the two existing ones that don't involve skipping ("dry-run mode builds plans without writing" and "apply mode writes each plan and records a completed run" — these should now also see `result.skipped` equal to `[]`, which `assert.equal`/`assert.deepEqual` calls on other fields don't touch, so they keep passing unmodified).

- [ ] **Step 6: Run the full worker suite**

```bash
npm run ingestion:test
```

Expected: exits `0`, no regressions in any other suite.

- [ ] **Step 7: Commit**

```bash
git add apps/ingestion-worker/src/cli/sync-espn-live-core.js apps/ingestion-worker/test/sync-espn-live.test.js
git commit -m "fix: skip unmapped ESPN fixtures instead of aborting the sync"
```

---

### Task 2: Add The Scheduled GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/sync-espn-live.yml`

**Interfaces:**
- Consumes: the existing `ingestion:sync-espn-live` root npm script (`npm run sync-espn-live --workspace apps/ingestion-worker --`, which itself runs `node --env-file-if-exists=.env.local src/cli/sync-espn-live.js`). In GitHub Actions there is no `.env.local` file; `process.env.SUPABASE_URL`/`process.env.SUPABASE_SERVICE_ROLE_KEY` are read directly from the step's `env:` block, which Node sees regardless of the missing file.
- Produces: nothing consumed by later tasks — this is a deployable artifact, not a library.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/sync-espn-live.yml`:

```yaml
name: Sync ESPN Live Data

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

concurrency:
  group: sync-espn-live
  cancel-in-progress: true

jobs:
  sync:
    name: Sync ESPN Live Data
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Run ESPN Sync
        run: npm run ingestion:sync-espn-live -- --apply
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

- [ ] **Step 2: Validate the YAML syntax**

```bash
node -e "require('node:fs').readFileSync('.github/workflows/sync-espn-live.yml', 'utf8')" && python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/sync-espn-live.yml')); print('valid yaml')"
```

Expected: prints `valid yaml`. If `python3`/`yaml` is unavailable, visually confirm indentation matches `.github/workflows/ci.yml`'s existing style instead.

- [ ] **Step 3: Run the secret scanner**

```bash
npm run secret:scan
```

Expected: no matches — the workflow file references secrets by name only (`${{ secrets.SUPABASE_URL }}`), never a literal value.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync-espn-live.yml
git commit -m "feat: schedule automated ESPN sync via GitHub Actions"
```

---

### Task 3: Set The Repository Secrets

**Files:** none (one-time `gh` CLI operation, not a code change)

- [ ] **Step 1: Confirm the values are available locally without displaying them**

```bash
awk -F= '{ if (length($2)>0) print $1" = SET"; else print $1" = EMPTY" }' apps/ingestion-worker/.env.local
```

Expected: `SUPABASE_URL = SET` and `SUPABASE_SERVICE_ROLE_KEY = SET`. If either is `EMPTY`, populate `apps/ingestion-worker/.env.local` with the values from the Supabase dashboard (Project Settings → API) before continuing — do not paste the values into chat or any committed file.

- [ ] **Step 2: Set the secrets via stdin, never as a visible command argument**

```bash
grep "^SUPABASE_URL=" apps/ingestion-worker/.env.local | cut -d= -f2- | gh secret set SUPABASE_URL --repo seungminnam/26WorldCup-prediction-project
grep "^SUPABASE_SERVICE_ROLE_KEY=" apps/ingestion-worker/.env.local | cut -d= -f2- | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo seungminnam/26WorldCup-prediction-project
```

Expected: each command prints a confirmation like `✓ Set Actions secret SUPABASE_URL for seungminnam/26WorldCup-prediction-project`.

- [ ] **Step 3: Confirm the secrets exist (names only, GitHub never reveals values)**

```bash
gh secret list --repo seungminnam/26WorldCup-prediction-project
```

Expected: both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` appear in the list.

---

### Task 4: Verify The Workflow Actually Runs End-To-End

**Files:** none (verification only)

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin feat/automated-espn-sync
gh pr create --base main --head feat/automated-espn-sync --title "feat: automate ESPN sync and harden it against unmapped fixtures" --body "See docs/superpowers/specs/2026-06-22-automated-espn-sync-design.md and docs/superpowers/plans/2026-06-22-automated-espn-sync.md for the full design and test evidence."
```

- [ ] **Step 2: Confirm CI passes on the PR**

```bash
gh pr checks --repo seungminnam/26WorldCup-prediction-project
```

Expected: `Test, Build, And Scan` passes (this confirms Task 1's test changes are green in CI, not just locally).

- [ ] **Step 3: After merging to `main`, manually trigger the new workflow once**

```bash
gh workflow run "Sync ESPN Live Data" --repo seungminnam/26WorldCup-prediction-project
```

(The scheduled workflow only exists on `main` once merged — `workflow_dispatch` for a workflow file only becomes available on the branch GitHub treats as the default, so this step happens after merge, not on the PR branch.)

- [ ] **Step 4: Confirm the manually-triggered run succeeded**

```bash
gh run list --workflow "Sync ESPN Live Data" --repo seungminnam/26WorldCup-prediction-project --limit 1
gh run view --repo seungminnam/26WorldCup-prediction-project --log $(gh run list --workflow "Sync ESPN Live Data" --repo seungminnam/26WorldCup-prediction-project --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: status `completed`/`success`, and the log shows the `Run ESPN Sync` step printing a JSON summary with a `mode: "apply"` result and no uncaught error.

- [ ] **Step 5: Confirm the cron actually fires on its own**

This step cannot be completed immediately — GitHub's scheduler can take up to its full interval to fire the first time. Check back after at least 15-20 minutes:

```bash
gh run list --workflow "Sync ESPN Live Data" --repo seungminnam/26WorldCup-prediction-project --limit 5
```

Expected: at least one run with trigger `schedule` (not `workflow_dispatch`) appears, confirming the cron is live.
