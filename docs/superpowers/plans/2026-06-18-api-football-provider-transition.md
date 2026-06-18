# API-Football Provider Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make API-Football the ingestion worker's default World Cup 2026 provider while retaining Sportmonks as a disabled fallback and keeping all public data behind the canonical Supabase schema.

**Architecture:** Add an API-Football HTTP client and response normalizer, then make mapping discovery consume provider-neutral normalized fixtures instead of Sportmonks response fields. Reuse the existing live-score upsert and Supabase boundaries, extending them only for assists, shootout scores, winner IDs, mapping reads, and an explicit live-sync CLI. The real provider remains in `evaluation` until a credentialed fixture dry run and one scheduled-to-final shadow test pass.

**Tech Stack:** Node.js ESM, Node built-in test runner, native `fetch`, npm workspaces, Supabase Postgres, `@supabase/supabase-js`.

---

## File Structure

- Create `apps/ingestion-worker/src/provider/api-football-client.js`
  - Owns authenticated HTTP requests, timeout behavior, response-envelope validation, and rate-limit metadata.
- Create `apps/ingestion-worker/src/provider/api-football.js`
  - Converts API-Football fixture objects into the existing canonical provider shape.
- Create `apps/ingestion-worker/src/provider/provider-fixtures.js`
  - Selects the correct raw-payload normalizer for mapping discovery without leaking provider fields into mapping code.
- Create `apps/ingestion-worker/src/cli/fetch-api-football-fixtures-core.js`
- Create `apps/ingestion-worker/src/cli/fetch-api-football-fixtures.js`
  - Fetches private fixture payloads into `.local-data/` without printing the key.
- Create `apps/ingestion-worker/src/cli/sync-api-football-live-core.js`
- Create `apps/ingestion-worker/src/cli/sync-api-football-live.js`
  - Performs one competition-scoped live poll, builds plans, and writes only when `--apply` is present.
- Create `apps/ingestion-worker/test/fixtures/api-football-fixtures.sample.json`
- Create `apps/ingestion-worker/test/fixtures/api-football-live-score.sample.json`
  - Stores minimal sanitized examples for offline tests.
- Create `apps/ingestion-worker/test/api-football-client.test.js`
- Create `apps/ingestion-worker/test/api-football.test.js`
- Create `apps/ingestion-worker/test/fetch-api-football-fixtures.test.js`
- Create `apps/ingestion-worker/test/sync-api-football-live.test.js`
- Modify `apps/ingestion-worker/src/mapping/discover-provider-mappings.js`
  - Consumes provider-neutral fixture properties.
- Modify `apps/ingestion-worker/src/cli/discover-mappings-core.js`
  - Defaults to API-Football and normalizes raw input before discovery.
- Modify `apps/ingestion-worker/src/sync/live-score.js`
  - Persists assists, penalty scores, and the winner while respecting score-null constraints.
- Modify `apps/ingestion-worker/src/storage/supabase-writer.js`
  - Loads API-Football mapping IDs and records terminal ingestion outcomes before a live sync returns.
- Modify `apps/ingestion-worker/src/cli/dry-run.js`
  - Uses the API-Football sanitized payload as the default offline demonstration.
- Modify `apps/ingestion-worker/package.json` and root `package.json`
  - Adds API-Football fixture and live-sync scripts while preserving Sportmonks fallback scripts.
- Create `apps/ingestion-worker/.env.local.example`
  - Documents secret names with empty values only.
- Create a Supabase migration using `supabase migration new select_api_football_provider`.
  - Adds API-Football as `evaluation` and disables Sportmonks without altering old migrations.
- Modify `supabase/schema.sql`
  - Mirrors the provider seed state for a fresh local database.
- Modify `README.md`, `docs/deployment.md`, and `docs/superpowers/specs/2026-06-17-live-data-ingestion-design.md`
  - Records the selected provider, free-plan limits, commands, and validation gate.

---

### Task 1: Normalize API-Football Fixtures And Events

**Files:**
- Create: `apps/ingestion-worker/test/fixtures/api-football-live-score.sample.json`
- Create: `apps/ingestion-worker/test/api-football.test.js`
- Create: `apps/ingestion-worker/src/provider/api-football.js`

- [ ] **Step 1: Add a sanitized finished-match payload**

Create `apps/ingestion-worker/test/fixtures/api-football-live-score.sample.json` with one `response` item containing this shape:

```json
{
  "response": [
    {
      "fixture": {
        "id": 1199001,
        "date": "2026-06-12T19:00:00+00:00",
        "status": { "short": "PEN", "elapsed": 120 },
        "venue": { "id": 501, "name": "Sample Stadium" }
      },
      "league": { "id": 1, "season": 2026, "round": "Round of 32" },
      "teams": {
        "home": { "id": 7001, "name": "Korea Republic", "code": "KOR" },
        "away": { "id": 7002, "name": "Czechia", "code": "CZE" }
      },
      "goals": { "home": 2, "away": 2 },
      "score": { "penalty": { "home": 4, "away": 3 } },
      "events": [
        {
          "time": { "elapsed": 32, "extra": null },
          "team": { "id": 7001 },
          "player": { "id": 801, "name": "Lee Kang-in" },
          "assist": { "id": 802, "name": "Son Heung-min" },
          "type": "Goal",
          "detail": "Normal Goal"
        },
        {
          "time": { "elapsed": 90, "extra": 4 },
          "team": { "id": 7002 },
          "player": { "id": 803, "name": "Patrik Schick" },
          "assist": { "id": null, "name": null },
          "type": "Goal",
          "detail": "Penalty"
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write failing normalizer tests**

Create `apps/ingestion-worker/test/api-football.test.js`. Assert that `normalizeApiFootballFixture(raw.response[0])` returns:

```js
{
  provider: "api-football",
  providerFixtureId: "1199001",
  providerLeagueId: "1",
  providerSeasonId: "2026",
  kickoffAt: "2026-06-12T19:00:00+00:00",
  venue: { providerVenueId: "501", name: "Sample Stadium" },
  round: "Round of 32",
  elapsed: 120,
  status: "final",
  home: {
    providerTeamId: "7001",
    name: "Korea Republic",
    code: "KOR",
    goals: 2,
    penalties: 4
  },
  away: {
    providerTeamId: "7002",
    name: "Czechia",
    code: "CZE",
    goals: 2,
    penalties: 3
  },
  events: [
    {
      providerEventId: "1199001:7001:32:0:Goal:Normal Goal:801",
      providerTeamId: "7001",
      playerName: "Lee Kang-in",
      assistPlayerName: "Son Heung-min",
      minute: 32,
      stoppageMinute: null,
      eventType: "goal"
    },
    {
      providerEventId: "1199001:7002:90:4:Goal:Penalty:803",
      providerTeamId: "7002",
      playerName: "Patrik Schick",
      assistPlayerName: null,
      minute: 90,
      stoppageMinute: 4,
      eventType: "penalty_goal"
    }
  ]
}
```

Add focused tests for these status mappings:

```js
const cases = [
  ["NS", "scheduled"],
  ["1H", "live"],
  ["HT", "live"],
  ["FT", "final"],
  ["AET", "final"],
  ["PEN", "final"],
  ["PST", "postponed"],
  ["CANC", "postponed"],
  ["SUSP", "result_pending"],
  ["ABD", "result_pending"]
];
```

Assert that `scheduled`, `postponed`, and `result_pending` fixtures normalize both goal values to `null`. Add a test that a fixture missing either team throws `API-Football fixture 1199001 is missing home or away team`.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test apps/ingestion-worker/test/api-football.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/provider/api-football.js`.

- [ ] **Step 4: Implement the API-Football normalizer**

Create `apps/ingestion-worker/src/provider/api-football.js` with these exported boundaries:

```js
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const FINAL = new Set(["FT", "AET", "PEN"]);
const POSTPONED = new Set(["PST", "CANC"]);
const RESULT_PENDING = new Set(["SUSP", "ABD", "AWD", "WO"]);

export function normalizeApiFootballPayload(payload) {
  if (!Array.isArray(payload?.response)) {
    throw new Error("API-Football response must contain a response array");
  }
  return payload.response.map(normalizeApiFootballFixture);
}

export function normalizeApiFootballFixture(payload) {
  const fixtureId = String(payload?.fixture?.id ?? "");
  const home = payload?.teams?.home;
  const away = payload?.teams?.away;
  if (!home?.id || !away?.id) {
    throw new Error(`API-Football fixture ${fixtureId} is missing home or away team`);
  }

  const status = normalizeApiFootballStatus(payload.fixture?.status?.short);
  const hasScore = status === "live" || status === "final";

  return {
    provider: "api-football",
    providerFixtureId: fixtureId,
    providerLeagueId: optionalString(payload.league?.id),
    providerSeasonId: optionalString(payload.league?.season),
    kickoffAt: payload.fixture?.date,
    venue: {
      providerVenueId: optionalString(payload.fixture?.venue?.id),
      name: payload.fixture?.venue?.name ?? null
    },
    round: payload.league?.round ?? null,
    elapsed: payload.fixture?.status?.elapsed ?? null,
    status,
    home: normalizeTeam(home, payload.goals?.home, payload.score?.penalty?.home, hasScore),
    away: normalizeTeam(away, payload.goals?.away, payload.score?.penalty?.away, hasScore),
    events: normalizeEvents(fixtureId, payload.events ?? [])
  };
}

export function normalizeApiFootballStatus(shortName) {
  if (FINAL.has(shortName)) return "final";
  if (LIVE.has(shortName)) return "live";
  if (POSTPONED.has(shortName)) return "postponed";
  if (RESULT_PENDING.has(shortName)) return "result_pending";
  return "scheduled";
}
```

Implement `normalizeTeam`, `normalizeEvents`, `normalizeEventType`, and `optionalString` as private helpers. `normalizeEventType` must map `Normal Goal`, `Own Goal`, `Penalty`, and `Missed Penalty` to the canonical event types and drop non-goal events for this MVP. Build the synthetic event ID from fixture, team, elapsed minute, extra minute or `0`, type, detail, and player ID; do not use array position.

- [ ] **Step 5: Run the focused and worker test suites**

```bash
node --test apps/ingestion-worker/test/api-football.test.js
npm run ingestion:test
```

Expected: both commands exit `0`; existing Sportmonks tests remain green.

- [ ] **Step 6: Commit the normalizer**

```bash
git add apps/ingestion-worker/src/provider/api-football.js apps/ingestion-worker/test/api-football.test.js apps/ingestion-worker/test/fixtures/api-football-live-score.sample.json
git commit -m "feat: normalize API-Football fixtures"
```

---

### Task 2: Add The Authenticated API-Football Client

**Files:**
- Create: `apps/ingestion-worker/test/api-football-client.test.js`
- Create: `apps/ingestion-worker/src/provider/api-football-client.js`

- [ ] **Step 1: Write failing client tests**

Test `createApiFootballClient` with an injected `fetchImpl`. Cover:

- Missing key throws `API_FOOTBALL_API_KEY is required`.
- `fetchFixturesBetween({ dateFrom, dateTo })` calls `/fixtures` with `league=1`, `season=2026`, `from`, `to`, and `timezone=UTC`.
- `fetchLiveFixtures()` calls `/fixtures?live=1`.
- Both requests send the key in `x-apisports-key`, never in the URL.
- A successful result has `{ payload, rateLimit }`, with numeric `limit`, `remaining`, and `resetAt` values read from `x-ratelimit-requests-limit`, `x-ratelimit-requests-remaining`, and `x-ratelimit-requests-reset` when present.
- A `401` rejects with `API-Football request failed with status 401` and does not include the test key.
- A `200` envelope with non-empty `errors` rejects with `API-Football returned provider errors`.

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test apps/ingestion-worker/test/api-football-client.test.js
```

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the client**

Create `apps/ingestion-worker/src/provider/api-football-client.js`:

```js
const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_LEAGUE_ID = 1;
const DEFAULT_SEASON = 2026;
const DEFAULT_TIMEOUT_MS = 20_000;

export function createApiFootballClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  leagueId = DEFAULT_LEAGUE_ID,
  season = DEFAULT_SEASON,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!apiKey) throw new Error("API_FOOTBALL_API_KEY is required");

  async function request(searchParams) {
    const url = new URL("/fixtures", baseUrl);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, {
      headers: { "x-apisports-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`API-Football request failed with status ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.errors && Object.keys(payload.errors).length > 0) {
      throw new Error("API-Football returned provider errors");
    }
    return { payload, rateLimit: readRateLimit(response.headers) };
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request({ league: leagueId, season, from: dateFrom, to: dateTo, timezone: "UTC" });
    },
    fetchLiveFixtures() {
      return request({ live: leagueId });
    }
  };
}
```

Add a private `readRateLimit(headers)` helper that returns nullable numbers and never includes the key or response body.

- [ ] **Step 4: Verify GREEN and regression coverage**

```bash
node --test apps/ingestion-worker/test/api-football-client.test.js
npm run ingestion:test
```

Expected: all tests pass with no network access.

- [ ] **Step 5: Commit the client**

```bash
git add apps/ingestion-worker/src/provider/api-football-client.js apps/ingestion-worker/test/api-football-client.test.js
git commit -m "feat: add API-Football client"
```

---

### Task 3: Make Mapping Discovery Provider-Neutral

**Files:**
- Create: `apps/ingestion-worker/src/provider/provider-fixtures.js`
- Create: `apps/ingestion-worker/test/fixtures/api-football-fixtures.sample.json`
- Modify: `apps/ingestion-worker/src/provider/sportmonks.js`
- Modify: `apps/ingestion-worker/src/mapping/discover-provider-mappings.js`
- Modify: `apps/ingestion-worker/src/cli/discover-mappings-core.js`
- Modify: `apps/ingestion-worker/test/discover-mappings.test.js`
- Modify: `apps/ingestion-worker/test/discover-mappings-cli.test.js`
- Modify: `apps/ingestion-worker/test/sportmonks.test.js`

- [ ] **Step 1: Add a sanitized API-Football fixture-list payload**

Create `api-football-fixtures.sample.json` with a single scheduled fixture using the same IDs, participants, league, season, and kickoff as Task 1, but set `status.short` to `NS`, goals to `null`, and events to an empty array.

- [ ] **Step 2: Rewrite discovery tests against the normalized contract**

Pass this shape directly to `discoverProviderMappings`:

```js
{
  providerFixtureId: "1199001",
  providerLeagueId: "1",
  providerSeasonId: "2026",
  kickoffAt: "2026-06-12T19:00:00+00:00",
  home: { providerTeamId: "7001", name: "Korea Republic", code: "KOR" },
  away: { providerTeamId: "7002", name: "Czechia", code: "CZE" }
}
```

Expected fixture mapping hash:

```text
api-football:1199001:2026-06-12T19:00:00+00:00:7001:7002
```

Update the no-match test to expect `api-football:1199001`. Update CLI tests so the default provider is:

```js
{
  providerId: "api-football",
  providerName: "API-Football",
  providerBaseUrl: "https://v3.football.api-sports.io",
  providerStatus: "evaluation"
}
```

Add a CLI test that an explicit `--provider-id sportmonks` still reads the existing Sportmonks sample.

- [ ] **Step 3: Verify RED**

```bash
node --test apps/ingestion-worker/test/discover-mappings.test.js apps/ingestion-worker/test/discover-mappings-cli.test.js
```

Expected: FAIL because discovery still reads `starting_at`, `participants`, and numeric `id`.

- [ ] **Step 4: Implement provider payload selection**

Create `provider-fixtures.js`:

```js
import { normalizeApiFootballPayload } from "./api-football.js";
import { normalizeSportmonksLiveScore } from "./sportmonks.js";

export function normalizeProviderFixturePayload(providerId, payload) {
  if (providerId === "api-football") return normalizeApiFootballPayload(payload);
  if (providerId === "sportmonks") {
    const fixtures = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
    return fixtures.map(normalizeSportmonksLiveScore);
  }
  throw new Error(`Unsupported provider: ${providerId}`);
}
```

Extend `normalizeSportmonksLiveScore` with nullable `providerLeagueId`, `providerSeasonId`, and team `code` fields so its output satisfies the shared discovery contract. Update the Sportmonks expected object accordingly.

- [ ] **Step 5: Refactor discovery to the shared fields**

Remove `getProviderParticipants`. Match `providerFixture.kickoffAt`, `providerFixture.home.name`, and `providerFixture.away.name`. Build team mappings from `providerTeamId`, `name`, and `code`. Build fixture mappings from `providerFixtureId`, `providerSeasonId`, and `providerLeagueId`.

In `runDiscoverMappings`, call:

```js
const providerFixtures = normalizeProviderFixturePayload(args.providerId, providerPayload);
return discoverProviderMappings({ local, providerFixtures, provider: { ... } });
```

- [ ] **Step 6: Verify both provider paths**

```bash
node --test apps/ingestion-worker/test/discover-mappings.test.js apps/ingestion-worker/test/discover-mappings-cli.test.js apps/ingestion-worker/test/sportmonks.test.js
npm run ingestion:test
```

Expected: API-Football is the default, Sportmonks fallback remains covered, and all worker tests pass.

- [ ] **Step 7: Commit the provider-neutral mapping boundary**

```bash
git add apps/ingestion-worker/src/provider apps/ingestion-worker/src/mapping/discover-provider-mappings.js apps/ingestion-worker/src/cli/discover-mappings-core.js apps/ingestion-worker/test
git commit -m "refactor: make provider mapping discovery neutral"
```

---

### Task 4: Add The API-Football Fixture Fetch CLI

**Files:**
- Create: `apps/ingestion-worker/test/fetch-api-football-fixtures.test.js`
- Create: `apps/ingestion-worker/src/cli/fetch-api-football-fixtures-core.js`
- Create: `apps/ingestion-worker/src/cli/fetch-api-football-fixtures.js`
- Modify: `apps/ingestion-worker/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Write failing argument and orchestration tests**

Mirror the existing Sportmonks fixture-fetch tests, using `.local-data/api-football/fixtures.json`. Assert that the runner:

- Requires `--date-from`, `--date-to`, and `--output`.
- Calls `client.fetchFixturesBetween({ dateFrom, dateTo })`.
- Writes only `result.payload`.
- Returns `fixtureCount`, `outputPath`, and `rateLimit`.
- Does not include a key in its return value.

- [ ] **Step 2: Verify RED**

```bash
node --test apps/ingestion-worker/test/fetch-api-football-fixtures.test.js
```

Expected: FAIL because the API-Football fetch CLI modules do not exist.

- [ ] **Step 3: Implement the core and executable CLI**

Keep argument parsing and file writing in the core module. In the executable module instantiate:

```js
const client = createApiFootballClient({
  apiKey: process.env.API_FOOTBALL_API_KEY
});
```

The executable must load `.env.local` through the npm script and print only the sanitized summary returned by the core.

- [ ] **Step 4: Add npm scripts**

Add to the worker:

```json
"fetch-api-football-fixtures": "node --env-file-if-exists=.env.local src/cli/fetch-api-football-fixtures.js"
```

Add to the root:

```json
"ingestion:fetch-api-football-fixtures": "npm run fetch-api-football-fixtures --workspace apps/ingestion-worker --"
```

Keep the Sportmonks commands during the shadow-test window.

- [ ] **Step 5: Verify tests and CLI help failure behavior**

```bash
node --test apps/ingestion-worker/test/fetch-api-football-fixtures.test.js
npm run ingestion:fetch-api-football-fixtures --
```

Expected: the test passes; the CLI exits non-zero with `--date-from is required` before making a network request.

- [ ] **Step 6: Commit the fixture CLI**

```bash
git add package.json apps/ingestion-worker/package.json apps/ingestion-worker/src/cli/fetch-api-football-fixtures* apps/ingestion-worker/test/fetch-api-football-fixtures.test.js
git commit -m "feat: add API-Football fixture fetch CLI"
```

---

### Task 5: Extend Canonical Live Updates

**Files:**
- Modify: `apps/ingestion-worker/test/live-score.test.js`
- Modify: `apps/ingestion-worker/src/sync/live-score.js`
- Modify: `apps/ingestion-worker/src/cli/dry-run.js`

- [ ] **Step 1: Add failing upsert-plan tests**

Change the main fixture to provider `api-football`, a tied final score, and a 4-3 shootout. Assert:

```js
{
  id: "A-2",
  status: "final",
  home_goals: 2,
  away_goals: 2,
  home_penalties: 4,
  away_penalties: 3,
  winner_team_id: "KOR",
  result_verified_at: null,
  source: "api-football"
}
```

Assert each event contains `assist_player_name`. Add separate tests proving:

- A scheduled/postponed/result-pending plan writes `home_goals`, `away_goals`, `home_penalties`, and `away_penalties` as `null` and `winner_team_id` as `null`.
- A final group-stage draw has no winner.
- A non-shootout final selects the higher-scoring mapped team.

- [ ] **Step 2: Verify RED**

```bash
node --test apps/ingestion-worker/test/live-score.test.js
```

Expected: FAIL because penalty, winner, and assist fields are absent.

- [ ] **Step 3: Implement the minimal canonical changes**

In `buildLiveScoreUpsertPlan`, resolve home and away local IDs once. Add:

```js
home_penalties: normalized.home.penalties ?? null,
away_penalties: normalized.away.penalties ?? null,
winner_team_id: determineWinnerTeamId(normalized, homeTeamId, awayTeamId)
```

Add `assist_player_name: event.assistPlayerName ?? null` to event rows. `determineWinnerTeamId` must return `null` for non-final fixtures, compare regulation/extra-time goals first, then compare penalties only when regulation goals are tied.

- [ ] **Step 4: Move the offline dry run to API-Football**

Read `api-football-live-score.sample.json`, call `normalizeApiFootballFixture(raw.response[0])`, and update sample mappings to fixture ID `1199001`. The dry run remains network-free and must not require environment variables.

- [ ] **Step 5: Verify GREEN**

```bash
node --test apps/ingestion-worker/test/live-score.test.js
npm run ingestion:dry-run
npm run ingestion:test
```

Expected: tests pass and dry-run JSON reports provider `api-football`, final score `2-2`, penalties `4-3`, and winner `KOR`.

- [ ] **Step 6: Commit canonical live updates**

```bash
git add apps/ingestion-worker/src/sync/live-score.js apps/ingestion-worker/src/cli/dry-run.js apps/ingestion-worker/test/live-score.test.js
git commit -m "feat: support API-Football live results"
```

---

### Task 6: Add One-Shot Live Sync With Mapping Reads

**Files:**
- Create: `apps/ingestion-worker/test/sync-api-football-live.test.js`
- Create: `apps/ingestion-worker/src/cli/sync-api-football-live-core.js`
- Create: `apps/ingestion-worker/src/cli/sync-api-football-live.js`
- Modify: `apps/ingestion-worker/test/supabase-writer.test.js`
- Modify: `apps/ingestion-worker/src/storage/supabase-writer.js`
- Modify: `apps/ingestion-worker/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Write failing Supabase mapping-read tests**

Add a recording client for these two queries:

```text
provider_fixture_mappings: provider_id = api-football -> provider_fixture_id, fixture_id
provider_team_mappings: provider_id = api-football -> provider_team_id, team_id
```

Assert `loadProviderMappings("api-football")` returns:

```js
{
  fixtureByProviderId: new Map([["1199001", "A-2"]]),
  teamByProviderId: new Map([["7001", "KOR"], ["7002", "CZE"]])
}
```

Assert either Supabase query error is thrown. Add a test that `recordIngestionRun` calls the service-role-only `record_ingestion_run` RPC with source, status, row counts, error message, and rate-limit metadata.

- [ ] **Step 2: Implement mapping reads and ingestion recording**

Add the method to `createSupabaseWriter`. Use `.select("provider_fixture_id,fixture_id").eq("provider_id", providerId)` and the analogous team query. Do not expose or log the service-role key.

Add `recordIngestionRun(run)` using:

```js
const result = await client.rpc("record_ingestion_run", {
  p_source: run.source,
  p_status: run.status,
  p_rows_seen: run.rowsSeen,
  p_rows_changed: run.rowsChanged,
  p_error_message: run.errorMessage ?? null,
  p_metadata: run.metadata ?? {}
});
```

Throw `result.error` when present.

- [ ] **Step 3: Write failing live-sync orchestration tests**

Test `runSyncApiFootballLive({ argv, client, store })` for:

- Default dry-run calls `fetchLiveFixtures`, normalizes the response, loads `api-football` mappings, returns plans, and never calls `applyLiveScorePlan`.
- `--apply` writes each plan once and returns only fixture IDs/counts plus rate-limit metadata.
- `remaining <= 10` still permits the current required live fetch result to be processed but reports `quotaState: "reserve"` so the scheduler can stop optional polling.
- An unmapped provider fixture rejects before any write.
- Apply mode records one `completed` ingestion run after all writes, or one `failed` run before rethrowing an apply error. Dry-run mode does not write an ingestion run.

- [ ] **Step 4: Verify RED**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js apps/ingestion-worker/test/sync-api-football-live.test.js
```

Expected: FAIL because the mapping reader and live-sync modules do not exist.

- [ ] **Step 5: Implement the one-shot sync**

The core must:

```js
const { payload, rateLimit } = await client.fetchLiveFixtures();
const mappings = await store.loadProviderMappings("api-football");
const plans = normalizeApiFootballPayload(payload).map((fixture) =>
  buildLiveScoreUpsertPlan(fixture, mappings)
);
```

Default to `mode: "dry-run"`; write only for `--apply`. Return `quotaState: "reserve"` when remaining calls are `10` or fewer, otherwise `normal`. Do not add an internal interval or daemon; the private host scheduler invokes this command every 8-10 minutes inside configured match windows.

After successful apply, call `recordIngestionRun` with `rowsSeen` equal to normalized fixture count and `rowsChanged` equal to applied plan count. On an apply failure, attempt a `failed` record with the original error message, then rethrow the original error so recording cannot disguise the sync failure.

The executable creates the API-Football client and Supabase writer from `API_FOOTBALL_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 6: Add npm scripts**

Worker:

```json
"sync-api-football-live": "node --env-file-if-exists=.env.local src/cli/sync-api-football-live.js"
```

Root:

```json
"ingestion:sync-api-football-live": "npm run sync-api-football-live --workspace apps/ingestion-worker --"
```

- [ ] **Step 7: Verify GREEN and dry failure without secrets**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js apps/ingestion-worker/test/sync-api-football-live.test.js
npm run ingestion:test
npm run ingestion:sync-api-football-live
```

Expected: tests pass; the real CLI exits non-zero with `API_FOOTBALL_API_KEY is required` when no local secret exists and never makes a request.

- [ ] **Step 8: Commit one-shot live sync**

```bash
git add package.json apps/ingestion-worker/package.json apps/ingestion-worker/src/storage/supabase-writer.js apps/ingestion-worker/src/cli/sync-api-football-live* apps/ingestion-worker/test/supabase-writer.test.js apps/ingestion-worker/test/sync-api-football-live.test.js
git commit -m "feat: add API-Football live sync command"
```

---

### Task 7: Record Provider Selection In Supabase

**Files:**
- Create: generated `supabase/migrations/*_select_api_football_provider.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Discover the installed CLI and create the migration**

```bash
npx supabase --version
npx supabase migration new select_api_football_provider
```

Expected: Supabase reports its version and creates one timestamped migration. Do not invent the timestamp manually.

- [ ] **Step 2: Add the provider transition SQL**

Put this in the generated migration:

```sql
insert into public.data_providers (id, name, base_url, status, notes)
values (
  'api-football',
  'API-Football',
  'https://v3.football.api-sports.io',
  'evaluation',
  'Selected World Cup 2026 primary candidate; activate after fixture dry run and shadow validation.'
)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  status = excluded.status,
  notes = excluded.notes;

update public.data_providers
set
  status = 'disabled',
  notes = 'Retained as a fallback adapter; not selected for the zero-cost MVP.'
where id = 'sportmonks';

grant usage on schema app_private to service_role;
grant insert on table app_private.ingestion_runs to service_role;

create or replace function public.record_ingestion_run(
  p_source text,
  p_status text,
  p_rows_seen integer,
  p_rows_changed integer,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.ingestion_runs (
    source,
    status,
    completed_at,
    rows_seen,
    rows_changed,
    error_message,
    metadata
  )
  values (
    p_source,
    p_status,
    now(),
    p_rows_seen,
    p_rows_changed,
    p_error_message,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_ingestion_run(text, text, integer, integer, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_ingestion_run(text, text, integer, integer, text, jsonb)
to service_role;
```

Mirror the same final seed state, grants, and function in `supabase/schema.sql`. Keep the function `security invoker`; do not turn it into an exposed `security definer` boundary. Do not edit `20260617035557_add_provider_ingestion_foundation.sql`.

- [ ] **Step 3: Verify migration structure**

```bash
npx supabase migration list --local
npx supabase db lint --local
```

Expected: the new migration is listed. Lint exits without SQL errors; if the local stack is unavailable, record that exact limitation and do not claim database verification.

- [ ] **Step 4: Apply only with explicit linked-project confirmation**

Inspect first:

```bash
npx supabase db push --help
```

After confirming the linked project, run:

```bash
npx supabase db push --linked
```

Expected: only the new provider-selection migration is applied. Query `public.data_providers` through the available Supabase SQL interface and confirm API-Football is `evaluation` and Sportmonks is `disabled`. Invoke `record_ingestion_run` as the service role with a sanitized verification row, confirm it appears in `app_private.ingestion_runs`, then delete only that known verification row through the SQL interface.

- [ ] **Step 5: Run advisors**

Use the installed CLI command discovered through `--help`, or the Supabase MCP advisor tool if available. Expected: this data-only migration introduces no new security or performance findings.

- [ ] **Step 6: Commit provider metadata**

```bash
git add supabase/schema.sql supabase/migrations
git commit -m "chore: select API-Football provider"
```

---

### Task 8: Update Configuration And Operations Documentation

**Files:**
- Create: `apps/ingestion-worker/.env.local.example`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/superpowers/specs/2026-06-17-live-data-ingestion-design.md`

- [ ] **Step 1: Add the safe worker environment example**

```text
API_FOOTBALL_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not add a real value or a `NEXT_PUBLIC_` prefix.

- [ ] **Step 2: Update the live ingestion design**

Replace the Sportmonks recommendation with the approved decision:

- API-Football is the primary candidate.
- Free operation uses an 8-10 minute competition-scoped poll and reserves at least 10 daily calls.
- Sportmonks is a disabled fallback during validation.
- Activation requires the fixture dry run and one scheduled-to-final shadow lifecycle.
- Exact live latency is not promised.

- [ ] **Step 3: Document operator commands**

Add these commands to `docs/deployment.md` and summarize them in `README.md`:

```bash
npm run ingestion:fetch-api-football-fixtures -- \
  --date-from 2026-06-11 \
  --date-to 2026-06-11 \
  --output .local-data/api-football/fixtures-2026-06-11.json

npm run ingestion:discover-mappings -- \
  --local-file path/to/local-tournament.json \
  --provider-file .local-data/api-football/fixtures-2026-06-11.json

npm run ingestion:sync-api-football-live
npm run ingestion:sync-api-football-live -- --apply
```

State that the first live command is a dry run, `--apply` writes canonical data, the private scheduler owns the 8-10 minute interval, and API-Football's free allowance is 100 calls per day.

- [ ] **Step 4: Document the shadow-test record**

Add a short checklist to `docs/deployment.md` for fixture count, participant/kickoff agreement, status timing, event completeness, final correction, request usage, and licensing confirmation. Leave the results explicitly marked `Not run: API_FOOTBALL_API_KEY required` until evidence exists; this is an execution status, not an unspecified design placeholder.

- [ ] **Step 5: Run documentation and secret checks**

```bash
rg -n "SPORTMONKS_API_TOKEN|API_FOOTBALL_API_KEY|100 requests|8-10" README.md docs apps/ingestion-worker/.env.local.example
npm run secret:scan
git diff --check
```

Expected: Sportmonks is described only as fallback/history, example keys are empty, secret scan passes, and diff check reports no whitespace errors.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md docs apps/ingestion-worker/.env.local.example
git commit -m "docs: document API-Football operations"
```

---

### Task 9: Run Full Verification And Credentialed Validation

**Files:**
- Verify: all files changed in Tasks 1-8
- Create only after a real run: `.local-data/api-football/*` (gitignored)

- [ ] **Step 1: Run all offline verification**

```bash
npm test
npm run ingestion:test
npm run ingestion:dry-run
npm run check
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
git diff --check
git status --short
```

Expected: every command exits `0`; the final status contains no uncommitted implementation changes.

- [ ] **Step 2: Run a one-day credentialed fixture fetch**

With `API_FOOTBALL_API_KEY` stored only in `apps/ingestion-worker/.env.local`:

```bash
npm run ingestion:fetch-api-football-fixtures -- \
  --date-from 2026-06-18 \
  --date-to 2026-06-18 \
  --output .local-data/api-football/fixtures-2026-06-18.json
```

Expected: the output file is gitignored, the summary reports a non-negative fixture count and rate-limit remainder, and neither terminal output nor Git contains the key.

- [ ] **Step 3: Generate and review API-Football mappings**

```bash
npm run ingestion:discover-mappings -- \
  --local-file apps/ingestion-worker/test/fixtures/local-tournament.sample.json \
  --provider-file .local-data/api-football/fixtures-2026-06-18.json \
  --provider-id api-football \
  --provider-name API-Football \
  --provider-base-url https://v3.football.api-sports.io
```

Expected: mapped identities are reviewed before any `--apply`. If the real tournament fixture does not match the sample local fixture, use the real canonical tournament export rather than weakening name or kickoff matching.

- [ ] **Step 4: Run the scheduled-to-final shadow test**

Invoke the dry live sync every 8-10 minutes for one match lifecycle, record sanitized timestamps and request counts, then compare score/status/events with a trusted match source. Do not activate writes if participant IDs, final score, or goal events disagree.

- [ ] **Step 5: Activate only after evidence passes**

After mapping import and shadow acceptance, run one controlled write:

```bash
npm run ingestion:sync-api-football-live -- --apply
```

Verify the affected canonical fixture and event rows in Supabase, then generate the activation migration:

```bash
npx supabase migration new activate_api_football_provider
```

Put this SQL in the generated migration and mirror the final status in `supabase/schema.sql`:

```sql
update public.data_providers
set
  status = 'active',
  notes = 'Primary World Cup 2026 provider after fixture and shadow validation.'
where id = 'api-football';
```

Run `npx supabase migration list --local`, review `npx supabase db push --help`, then apply with `npx supabase db push --linked`. Confirm the public row is `active`. Do not rewrite the provider-selection migration from Task 7.

- [ ] **Step 6: Record validation outcome**

Replace the `Not run` shadow-test status in `docs/deployment.md` with the date, fixture ID, observed maximum delay, event agreement, daily request count, and activation decision. Commit only sanitized results:

```bash
git add docs/deployment.md supabase/schema.sql supabase/migrations
git commit -m "docs: record API-Football validation"
```
