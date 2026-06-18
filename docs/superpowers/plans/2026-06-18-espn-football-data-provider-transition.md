# ESPN + football-data.org Provider Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ESPN's public (keyless) scoreboard API the ingestion worker's primary World Cup 2026 data source, add football-data.org as a read-only reconciliation fallback, and disable API-Football (its free plan rejects the 2026 season) while keeping its code intact as a dormant adapter.

**Architecture:** Add an ESPN HTTP client and normalizer following the same client/normalizer/CLI/mapping pattern already established for Sportmonks and API-Football. Reuse the existing provider-neutral mapping discovery, `buildLiveScoreUpsertPlan`, and Supabase writer untouched. Add a football-data.org client/normalizer used only by a new read-only reconciliation CLI (no canonical writes). Replace the API-Football quota-reservation polling design with a simple fixed-interval poll, since ESPN has no daily request cap.

**Tech Stack:** Node.js ESM, Node built-in test runner, native `fetch`, npm workspaces, Supabase Postgres, `@supabase/supabase-js`.

---

## File Structure

- Create `apps/ingestion-worker/src/provider/espn-client.js` — keyless HTTP client for ESPN's scoreboard and teams endpoints.
- Create `apps/ingestion-worker/src/provider/espn.js` — normalizes ESPN fixtures/teams/events into the canonical provider-neutral contract; filters out unresolved knockout placeholder fixtures.
- Create `apps/ingestion-worker/src/provider/football-data-client.js` — token-authenticated HTTP client for football-data.org.
- Create `apps/ingestion-worker/src/provider/football-data.js` — normalizes football-data.org matches (fixtures/score/status only, no events).
- Modify `apps/ingestion-worker/src/provider/provider-fixtures.js` — add an `espn` branch (with placeholder filtering) alongside the existing `api-football`/`sportmonks` branches.
- Modify `apps/ingestion-worker/src/cli/discover-mappings-core.js` — default provider becomes `espn`; add optional `--provider-teams-file` used only to filter ESPN placeholders.
- Create `apps/ingestion-worker/src/cli/fetch-espn-fixtures-core.js` / `fetch-espn-fixtures.js` — fetches ESPN fixtures + teams into `.local-data/`.
- Create `apps/ingestion-worker/src/cli/sync-espn-live-core.js` / `sync-espn-live.js` — one-shot ESPN poll → canonical write plan, `--apply` gated, no quota fields.
- Create `apps/ingestion-worker/src/cli/compare-football-data-core.js` / `compare-football-data.js` — read-only diff between football-data.org and canonical Supabase fixtures; never writes.
- Modify `apps/ingestion-worker/src/cli/dry-run.js` — switch the offline demo to the ESPN sample.
- Modify `apps/ingestion-worker/src/storage/supabase-writer.js` — add `loadCanonicalFixtures()` read used only by the reconciliation CLI.
- Create test fixtures under `apps/ingestion-worker/test/fixtures/`: `espn-scoreboard.sample.json`, `espn-teams.sample.json`, `football-data-matches.sample.json`.
- Create tests: `espn.test.js`, `espn-client.test.js`, `football-data.test.js`, `football-data-client.test.js`, `fetch-espn-fixtures.test.js`, `sync-espn-live.test.js`, `compare-football-data.test.js`. Modify `discover-mappings.test.js`, `discover-mappings-cli.test.js`, `supabase-writer.test.js`.
- Modify `apps/ingestion-worker/package.json` and root `package.json` — add ESPN/football-data scripts, keep API-Football/Sportmonks scripts as dormant fallbacks.
- Modify `apps/ingestion-worker/.env.local.example` — add `FOOTBALL_DATA_API_TOKEN`; ESPN needs no variable.
- Create a Supabase migration via `npx supabase migration new select_espn_provider` — adds `espn` and `football-data` rows, disables `api-football` with a season-gating note.
- Modify `supabase/schema.sql` to mirror the migration.
- Modify `README.md`, `docs/deployment.md`, `docs/superpowers/specs/2026-06-17-live-data-ingestion-design.md` — record the new provider decision, commands, and validation gate.

---

### Task 1: Normalize ESPN Fixtures, Teams, And Events

**Files:**
- Create: `apps/ingestion-worker/test/fixtures/espn-scoreboard.sample.json`
- Create: `apps/ingestion-worker/test/fixtures/espn-teams.sample.json`
- Create: `apps/ingestion-worker/test/espn.test.js`
- Create: `apps/ingestion-worker/src/provider/espn.js`

- [ ] **Step 1: Add a sanitized scoreboard payload with three fixtures**

Create `apps/ingestion-worker/test/fixtures/espn-scoreboard.sample.json`:

```json
{
  "events": [
    {
      "id": "760415",
      "date": "2026-06-11T19:00Z",
      "season": { "year": 2026, "slug": "group-stage" },
      "competitions": [
        {
          "id": "760415",
          "venue": { "id": "1672", "fullName": "Estadio Banorte" },
          "altGameNote": "FIFA World Cup, Group A",
          "status": {
            "clock": 5400.0,
            "type": { "id": "28", "name": "STATUS_FULL_TIME", "state": "post", "completed": true }
          },
          "competitors": [
            { "homeAway": "home", "score": "2", "team": { "id": "203", "displayName": "Mexico", "abbreviation": "MEX" } },
            { "homeAway": "away", "score": "0", "team": { "id": "774", "displayName": "South Africa", "abbreviation": "RSA" } }
          ],
          "details": [
            {
              "type": { "id": "70", "text": "Goal" },
              "clock": { "value": 513.0, "displayValue": "9'" },
              "team": { "id": "203" },
              "scoringPlay": true,
              "redCard": false,
              "yellowCard": false,
              "penaltyKick": false,
              "ownGoal": false,
              "athletesInvolved": [{ "id": "233075", "displayName": "Julián Quiñones" }]
            },
            {
              "type": { "id": "94", "text": "Yellow Card" },
              "clock": { "value": 981.0, "displayValue": "17'" },
              "team": { "id": "774" },
              "scoringPlay": false,
              "redCard": false,
              "yellowCard": true,
              "penaltyKick": false,
              "ownGoal": false,
              "athletesInvolved": [{ "id": "256691", "displayName": "Some Defender" }]
            },
            {
              "type": { "id": "137", "text": "Goal - Header" },
              "clock": { "value": 4023.0, "displayValue": "67'" },
              "team": { "id": "203" },
              "scoringPlay": true,
              "redCard": false,
              "yellowCard": false,
              "penaltyKick": false,
              "ownGoal": false,
              "athletesInvolved": [{ "id": "167060", "displayName": "Santiago Giménez" }]
            }
          ]
        }
      ]
    },
    {
      "id": "760416",
      "date": "2026-06-18T16:00Z",
      "season": { "year": 2026, "slug": "group-stage" },
      "competitions": [
        {
          "id": "760416",
          "venue": { "id": "1700", "fullName": "Sample Arena" },
          "altGameNote": "FIFA World Cup, Group A",
          "status": {
            "clock": 0.0,
            "type": { "id": "1", "name": "STATUS_SCHEDULED", "state": "pre", "completed": false }
          },
          "competitors": [
            { "homeAway": "home", "score": "0", "team": { "id": "774", "displayName": "South Africa", "abbreviation": "RSA" } },
            { "homeAway": "away", "score": "0", "team": { "id": "773", "displayName": "Czechia", "abbreviation": "CZE" } }
          ],
          "details": []
        }
      ]
    },
    {
      "id": "760486",
      "date": "2026-06-28T19:00Z",
      "season": { "year": 2026, "slug": "knockout" },
      "competitions": [
        {
          "id": "760486",
          "venue": null,
          "altGameNote": "FIFA World Cup, Round of 32",
          "status": {
            "clock": 0.0,
            "type": { "id": "1", "name": "STATUS_SCHEDULED", "state": "pre", "completed": false }
          },
          "competitors": [
            { "homeAway": "home", "score": "0", "team": { "id": "5926", "displayName": "Group A 2nd Place", "abbreviation": "2A" } },
            { "homeAway": "away", "score": "0", "team": { "id": "5924", "displayName": "Group B 2nd Place", "abbreviation": "2B" } }
          ],
          "details": []
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Add a sanitized teams payload**

Create `apps/ingestion-worker/test/fixtures/espn-teams.sample.json`:

```json
{
  "sports": [
    {
      "leagues": [
        {
          "teams": [
            { "team": { "id": "203", "displayName": "Mexico", "abbreviation": "MEX" } },
            { "team": { "id": "774", "displayName": "South Africa", "abbreviation": "RSA" } },
            { "team": { "id": "773", "displayName": "Czechia", "abbreviation": "CZE" } }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Write failing normalizer tests**

Create `apps/ingestion-worker/test/espn.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeEspnFixture,
  normalizeEspnPayload,
  normalizeEspnTeams,
  normalizeEspnStatus
} from "../src/provider/espn.js";

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

test("normalizes a finished ESPN fixture with goal events", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[0]);

  assert.deepEqual(result, {
    provider: "espn",
    providerFixtureId: "760415",
    providerLeagueId: "fifa.world",
    providerSeasonId: "2026",
    kickoffAt: "2026-06-11T19:00Z",
    venue: { providerVenueId: "1672", name: "Estadio Banorte" },
    round: "FIFA World Cup, Group A",
    elapsed: 90,
    status: "final",
    home: { providerTeamId: "203", name: "Mexico", code: "MEX", goals: 2, penalties: null },
    away: { providerTeamId: "774", name: "South Africa", code: "RSA", goals: 0, penalties: null },
    events: [
      {
        providerEventId: "760415:203:513:70:233075",
        providerTeamId: "203",
        playerName: "Julián Quiñones",
        assistPlayerName: null,
        minute: 9,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "760415:203:4023:137:167060",
        providerTeamId: "203",
        playerName: "Santiago Giménez",
        assistPlayerName: null,
        minute: 67,
        stoppageMinute: null,
        eventType: "goal"
      }
    ]
  });
});

test("normalizes a scheduled fixture with null scores and no events", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[1]);

  assert.equal(result.status, "scheduled");
  assert.equal(result.home.goals, null);
  assert.equal(result.away.goals, null);
  assert.deepEqual(result.events, []);
});

test("normalizes a placeholder knockout fixture without throwing", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnFixture(raw.events[2]);

  assert.equal(result.home.providerTeamId, "5926");
  assert.equal(result.away.providerTeamId, "5924");
  assert.deepEqual(result.venue, { providerVenueId: null, name: null });
});

test("status mapping covers scheduled, live, final, postponed, result_pending", () => {
  const cases = [
    ["STATUS_SCHEDULED", "scheduled"],
    ["STATUS_IN_PROGRESS", "live"],
    ["STATUS_HALFTIME", "live"],
    ["STATUS_FULL_TIME", "final"],
    ["STATUS_POSTPONED", "postponed"],
    ["STATUS_CANCELED", "postponed"],
    ["STATUS_SUSPENDED", "result_pending"],
    ["STATUS_ABANDONED", "result_pending"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeEspnStatus(input), expected, input);
  }
});

test("rejects a fixture missing a competitor", () => {
  assert.throws(
    () => normalizeEspnFixture({ id: "1", competitions: [{ competitors: [] }] }),
    /ESPN fixture 1 is missing home or away competitor/
  );
});

test("normalizeEspnPayload filters out fixtures with unresolved placeholder teams", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const teamsRaw = await loadFixture("espn-teams.sample.json");
  const knownTeamIds = new Set(normalizeEspnTeams(teamsRaw).map((team) => team.providerTeamId));

  const result = normalizeEspnPayload(raw, { knownTeamIds });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((fixture) => fixture.providerFixtureId), ["760415", "760416"]);
});

test("normalizeEspnPayload without knownTeamIds returns every fixture", async () => {
  const raw = await loadFixture("espn-scoreboard.sample.json");
  const result = normalizeEspnPayload(raw);
  assert.equal(result.length, 3);
});

test("normalizeEspnTeams returns provider-neutral team rows", async () => {
  const teamsRaw = await loadFixture("espn-teams.sample.json");
  const result = normalizeEspnTeams(teamsRaw);

  assert.deepEqual(result, [
    { providerTeamId: "203", name: "Mexico", code: "MEX" },
    { providerTeamId: "774", name: "South Africa", code: "RSA" },
    { providerTeamId: "773", name: "Czechia", code: "CZE" }
  ]);
});
```

- [ ] **Step 4: Run the test and verify RED**

```bash
node --test apps/ingestion-worker/test/espn.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/provider/espn.js`.

- [ ] **Step 5: Implement the ESPN normalizer**

Create `apps/ingestion-worker/src/provider/espn.js`:

```js
const LIVE_STATUS_NAMES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
  "STATUS_HALFTIME",
  "STATUS_EXTRA_TIME",
  "STATUS_PENALTIES"
]);
const FINAL_STATUS_NAMES = new Set(["STATUS_FULL_TIME", "STATUS_FINAL"]);
const POSTPONED_STATUS_NAMES = new Set(["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_CANCELLED"]);
const RESULT_PENDING_STATUS_NAMES = new Set(["STATUS_SUSPENDED", "STATUS_ABANDONED", "STATUS_DELAYED"]);

export function normalizeEspnStatus(statusTypeName) {
  if (FINAL_STATUS_NAMES.has(statusTypeName)) return "final";
  if (LIVE_STATUS_NAMES.has(statusTypeName)) return "live";
  if (POSTPONED_STATUS_NAMES.has(statusTypeName)) return "postponed";
  if (RESULT_PENDING_STATUS_NAMES.has(statusTypeName)) return "result_pending";
  return "scheduled";
}

export function normalizeEspnFixture(event) {
  const fixtureId = String(event?.id ?? "");
  const competition = event?.competitions?.[0];
  const homeCompetitor = competition?.competitors?.find((entry) => entry.homeAway === "home");
  const awayCompetitor = competition?.competitors?.find((entry) => entry.homeAway === "away");

  if (!homeCompetitor?.team?.id || !awayCompetitor?.team?.id) {
    throw new Error(`ESPN fixture ${fixtureId} is missing home or away competitor`);
  }

  const status = normalizeEspnStatus(competition?.status?.type?.name);
  const hasScore = status === "live" || status === "final";

  return {
    provider: "espn",
    providerFixtureId: fixtureId,
    providerLeagueId: "fifa.world",
    providerSeasonId: optionalString(event?.season?.year),
    kickoffAt: event?.date,
    venue: {
      providerVenueId: optionalString(competition?.venue?.id),
      name: competition?.venue?.fullName ?? null
    },
    round: competition?.altGameNote ?? null,
    elapsed: hasScore ? secondsToMinutes(competition?.status?.clock) : null,
    status,
    home: normalizeCompetitor(homeCompetitor, hasScore),
    away: normalizeCompetitor(awayCompetitor, hasScore),
    events: normalizeEvents(fixtureId, competition?.details ?? [])
  };
}

export function normalizeEspnPayload(payload, { knownTeamIds } = {}) {
  if (!Array.isArray(payload?.events)) {
    throw new Error("ESPN response must contain an events array");
  }

  const fixtures = payload.events.map(normalizeEspnFixture);

  if (!knownTeamIds) {
    return fixtures;
  }

  return fixtures.filter(
    (fixture) => knownTeamIds.has(fixture.home.providerTeamId) && knownTeamIds.has(fixture.away.providerTeamId)
  );
}

export function normalizeEspnTeams(payload) {
  const teams = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((entry) => ({
    providerTeamId: String(entry.team.id),
    name: entry.team.displayName,
    code: entry.team.abbreviation ?? null
  }));
}

function normalizeCompetitor(competitor, hasScore) {
  return {
    providerTeamId: String(competitor.team.id),
    name: competitor.team.displayName,
    code: competitor.team.abbreviation ?? null,
    goals: hasScore ? Number(competitor.score) : null,
    penalties: null
  };
}

function normalizeEvents(fixtureId, details) {
  return details
    .filter((detail) => detail.scoringPlay === true)
    .map((detail) => {
      const teamId = String(detail.team?.id ?? "");
      const athlete = detail.athletesInvolved?.[0];
      const athleteId = athlete?.id ?? "0";
      const { minute, stoppageMinute } = parseClockDisplay(detail.clock);

      return {
        providerEventId: `${fixtureId}:${teamId}:${Math.round(detail.clock?.value ?? 0)}:${detail.type?.id ?? "0"}:${athleteId}`,
        providerTeamId: teamId,
        playerName: athlete?.displayName ?? null,
        assistPlayerName: null,
        minute,
        stoppageMinute,
        eventType: detail.ownGoal ? "own_goal" : detail.penaltyKick ? "penalty_goal" : "goal"
      };
    });
}

function parseClockDisplay(clock) {
  const display = clock?.displayValue ?? "";
  const match = display.match(/^(\d+)(?:\+(\d+))?'?$/);

  if (!match) {
    return { minute: secondsToMinutes(clock) ?? 0, stoppageMinute: null };
  }

  return {
    minute: Number(match[1]),
    stoppageMinute: match[2] ? Number(match[2]) : null
  };
}

function secondsToMinutes(clock) {
  if (!clock || typeof clock.value !== "number") return null;
  return Math.floor(clock.value / 60);
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}
```

- [ ] **Step 6: Run the focused and worker test suites**

```bash
node --test apps/ingestion-worker/test/espn.test.js
npm run ingestion:test
```

Expected: both commands exit `0`; existing Sportmonks/API-Football tests remain green.

- [ ] **Step 7: Commit the normalizer**

```bash
git add apps/ingestion-worker/src/provider/espn.js apps/ingestion-worker/test/espn.test.js apps/ingestion-worker/test/fixtures/espn-scoreboard.sample.json apps/ingestion-worker/test/fixtures/espn-teams.sample.json
git commit -m "feat: normalize ESPN World Cup fixtures and teams"
```

---

### Task 2: Add The Keyless ESPN Client

**Files:**
- Create: `apps/ingestion-worker/test/espn-client.test.js`
- Create: `apps/ingestion-worker/src/provider/espn-client.js`

- [ ] **Step 1: Write failing client tests**

Create `apps/ingestion-worker/test/espn-client.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createEspnClient } from "../src/provider/espn-client.js";

function fakeFetch(responder) {
  return async (url) => responder(url.toString());
}

test("fetchFixturesBetween calls the scoreboard endpoint with a compact date range", async () => {
  let requestedUrl;
  const client = createEspnClient({
    fetchImpl: fakeFetch((url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    })
  });

  await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-19" });

  assert.match(requestedUrl, /\/scoreboard\?/);
  assert.match(requestedUrl, /dates=20260618-20260619/);
  assert.match(requestedUrl, /limit=200/);
});

test("fetchTeams calls the teams endpoint", async () => {
  let requestedUrl;
  const client = createEspnClient({
    fetchImpl: fakeFetch((url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ sports: [] }) };
    })
  });

  await client.fetchTeams();

  assert.match(requestedUrl, /\/teams\?/);
  assert.match(requestedUrl, /limit=60/);
});

test("rejects with a status-coded error on a non-ok response", async () => {
  const client = createEspnClient({
    fetchImpl: fakeFetch(() => ({ ok: false, status: 503, json: async () => ({}) }))
  });

  await assert.rejects(client.fetchTeams(), /ESPN request failed with status 503/);
});

test("returns the parsed payload on success", async () => {
  const client = createEspnClient({
    fetchImpl: fakeFetch(() => ({ ok: true, status: 200, json: async () => ({ events: [{ id: "1" }] }) }))
  });

  const result = await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-18" });
  assert.deepEqual(result, { events: [{ id: "1" }] });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test apps/ingestion-worker/test/espn-client.test.js
```

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the client**

Create `apps/ingestion-worker/src/provider/espn-client.js`:

```js
const DEFAULT_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const DEFAULT_TIMEOUT_MS = 20_000;

export function createEspnClient({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  async function request(pathSegment, searchParams = {}) {
    const url = new URL(`${baseUrl}/${pathSegment}`);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!response.ok) {
      throw new Error(`ESPN request failed with status ${response.status}`);
    }

    return response.json();
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request("scoreboard", {
        dates: `${compactDate(dateFrom)}-${compactDate(dateTo)}`,
        limit: 200
      });
    },

    fetchTeams() {
      return request("teams", { limit: 60 });
    }
  };
}

function compactDate(isoDate) {
  return isoDate.replaceAll("-", "");
}
```

- [ ] **Step 4: Verify GREEN and regression coverage**

```bash
node --test apps/ingestion-worker/test/espn-client.test.js
npm run ingestion:test
```

Expected: all tests pass with no network access.

- [ ] **Step 5: Commit the client**

```bash
git add apps/ingestion-worker/src/provider/espn-client.js apps/ingestion-worker/test/espn-client.test.js
git commit -m "feat: add keyless ESPN client"
```

---

### Task 3: Add football-data.org Client And Normalizer (Reconciliation Only)

**Files:**
- Create: `apps/ingestion-worker/test/fixtures/football-data-matches.sample.json`
- Create: `apps/ingestion-worker/test/football-data.test.js`
- Create: `apps/ingestion-worker/test/football-data-client.test.js`
- Create: `apps/ingestion-worker/src/provider/football-data.js`
- Create: `apps/ingestion-worker/src/provider/football-data-client.js`

- [ ] **Step 1: Add a sanitized football-data.org matches payload**

Create `apps/ingestion-worker/test/fixtures/football-data-matches.sample.json`:

```json
{
  "matches": [
    {
      "id": 537327,
      "utcDate": "2026-06-11T19:00:00Z",
      "status": "FINISHED",
      "homeTeam": { "id": 769, "name": "Mexico" },
      "awayTeam": { "id": 774, "name": "South Africa" },
      "score": { "fullTime": { "home": 2, "away": 0 } }
    },
    {
      "id": 537328,
      "utcDate": "2026-06-18T16:00:00Z",
      "status": "SCHEDULED",
      "homeTeam": { "id": 774, "name": "South Africa" },
      "awayTeam": { "id": 773, "name": "Czechia" },
      "score": { "fullTime": { "home": null, "away": null } }
    }
  ]
}
```

- [ ] **Step 2: Write failing normalizer tests**

Create `apps/ingestion-worker/test/football-data.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeFootballDataMatch,
  normalizeFootballDataPayload,
  normalizeFootballDataStatus
} from "../src/provider/football-data.js";

test("normalizes a finished football-data.org match", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataMatch(raw.matches[0]);

  assert.deepEqual(result, {
    provider: "football-data",
    providerFixtureId: "537327",
    kickoffAt: "2026-06-11T19:00:00Z",
    status: "final",
    home: { name: "Mexico", goals: 2 },
    away: { name: "South Africa", goals: 0 }
  });
});

test("normalizes a scheduled match with null goals", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataMatch(raw.matches[1]);
  assert.equal(result.status, "scheduled");
  assert.equal(result.home.goals, null);
  assert.equal(result.away.goals, null);
});

test("status mapping covers all known football-data.org statuses", () => {
  const cases = [
    ["SCHEDULED", "scheduled"],
    ["TIMED", "scheduled"],
    ["IN_PLAY", "live"],
    ["PAUSED", "live"],
    ["FINISHED", "final"],
    ["AWARDED", "final"],
    ["POSTPONED", "postponed"],
    ["CANCELLED", "postponed"],
    ["SUSPENDED", "result_pending"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeFootballDataStatus(input), expected, input);
  }
});

test("normalizeFootballDataPayload maps every match in the response", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataPayload(raw);
  assert.equal(result.length, 2);
});

test("rejects a payload without a matches array", () => {
  assert.throws(() => normalizeFootballDataPayload({}), /matches array/);
});
```

- [ ] **Step 3: Verify RED, then implement the normalizer**

```bash
node --test apps/ingestion-worker/test/football-data.test.js
```

Expected: FAIL because the module does not exist. Create `apps/ingestion-worker/src/provider/football-data.js`:

```js
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);
const FINAL_STATUSES = new Set(["FINISHED", "AWARDED"]);
const POSTPONED_STATUSES = new Set(["POSTPONED", "CANCELLED"]);
const RESULT_PENDING_STATUSES = new Set(["SUSPENDED"]);

export function normalizeFootballDataStatus(status) {
  if (FINAL_STATUSES.has(status)) return "final";
  if (LIVE_STATUSES.has(status)) return "live";
  if (POSTPONED_STATUSES.has(status)) return "postponed";
  if (RESULT_PENDING_STATUSES.has(status)) return "result_pending";
  return "scheduled";
}

export function normalizeFootballDataMatch(match) {
  return {
    provider: "football-data",
    providerFixtureId: String(match?.id ?? ""),
    kickoffAt: match?.utcDate,
    status: normalizeFootballDataStatus(match?.status),
    home: {
      name: match?.homeTeam?.name ?? null,
      goals: match?.score?.fullTime?.home ?? null
    },
    away: {
      name: match?.awayTeam?.name ?? null,
      goals: match?.score?.fullTime?.away ?? null
    }
  };
}

export function normalizeFootballDataPayload(payload) {
  if (!Array.isArray(payload?.matches)) {
    throw new Error("football-data.org response must contain a matches array");
  }
  return payload.matches.map(normalizeFootballDataMatch);
}
```

Run again to verify GREEN:

```bash
node --test apps/ingestion-worker/test/football-data.test.js
```

- [ ] **Step 4: Write failing client tests**

Create `apps/ingestion-worker/test/football-data-client.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createFootballDataClient } from "../src/provider/football-data-client.js";

function fakeFetch(responder) {
  return async (url, init) => responder(url.toString(), init);
}

test("throws without a token", () => {
  assert.throws(() => createFootballDataClient({}), /FOOTBALL_DATA_API_TOKEN is required/);
});

test("fetchFixturesBetween calls the WC matches endpoint with the auth header", async () => {
  let requestedUrl;
  let requestedHeaders;
  const client = createFootballDataClient({
    apiToken: "test-token",
    fetchImpl: fakeFetch((url, init) => {
      requestedUrl = url;
      requestedHeaders = init.headers;
      return { ok: true, status: 200, json: async () => ({ matches: [] }) };
    })
  });

  await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-19" });

  assert.match(requestedUrl, /\/competitions\/WC\/matches\?/);
  assert.match(requestedUrl, /dateFrom=2026-06-18/);
  assert.match(requestedUrl, /dateTo=2026-06-19/);
  assert.equal(requestedHeaders["X-Auth-Token"], "test-token");
});

test("rejects with a status-coded error and never includes the token", async () => {
  const client = createFootballDataClient({
    apiToken: "test-token",
    fetchImpl: fakeFetch(() => ({ ok: false, status: 403, json: async () => ({}) }))
  });

  await assert.rejects(
    client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-18" }),
    (error) => {
      assert.match(error.message, /football-data\.org request failed with status 403/);
      assert.doesNotMatch(error.message, /test-token/);
      return true;
    }
  );
});
```

- [ ] **Step 5: Verify RED, then implement the client**

```bash
node --test apps/ingestion-worker/test/football-data-client.test.js
```

Expected: FAIL because the module does not exist. Create `apps/ingestion-worker/src/provider/football-data-client.js`:

```js
const DEFAULT_BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_COMPETITION_CODE = "WC";
const DEFAULT_TIMEOUT_MS = 20_000;

export function createFootballDataClient({
  apiToken,
  baseUrl = DEFAULT_BASE_URL,
  competitionCode = DEFAULT_COMPETITION_CODE,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!apiToken) {
    throw new Error("FOOTBALL_DATA_API_TOKEN is required");
  }

  async function request(pathSegment, searchParams = {}) {
    const url = new URL(`${baseUrl}${pathSegment}`);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, {
      headers: { "X-Auth-Token": apiToken },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`football-data.org request failed with status ${response.status}`);
    }

    return response.json();
  }

  return {
    fetchFixturesBetween({ dateFrom, dateTo }) {
      return request(`/competitions/${competitionCode}/matches`, { dateFrom, dateTo });
    }
  };
}
```

- [ ] **Step 6: Verify GREEN and regression coverage**

```bash
node --test apps/ingestion-worker/test/football-data.test.js apps/ingestion-worker/test/football-data-client.test.js
npm run ingestion:test
```

- [ ] **Step 7: Commit**

```bash
git add apps/ingestion-worker/src/provider/football-data.js apps/ingestion-worker/src/provider/football-data-client.js apps/ingestion-worker/test/football-data.test.js apps/ingestion-worker/test/football-data-client.test.js apps/ingestion-worker/test/fixtures/football-data-matches.sample.json
git commit -m "feat: add football-data.org client and normalizer"
```

---

### Task 4: Make ESPN The Default Mapping-Discovery Provider

**Files:**
- Modify: `apps/ingestion-worker/src/provider/provider-fixtures.js`
- Modify: `apps/ingestion-worker/src/cli/discover-mappings-core.js`
- Modify: `apps/ingestion-worker/test/discover-mappings.test.js`
- Modify: `apps/ingestion-worker/test/discover-mappings-cli.test.js`

- [ ] **Step 1: Write failing tests for the espn branch and new default**

Modify `apps/ingestion-worker/test/discover-mappings.test.js` to add:

```js
import { normalizeProviderFixturePayload } from "../src/provider/provider-fixtures.js";

test("normalizeProviderFixturePayload filters ESPN placeholder fixtures with knownTeamIds", async () => {
  const scoreboard = JSON.parse(
    await readFile(new URL("./fixtures/espn-scoreboard.sample.json", import.meta.url), "utf8")
  );
  const knownTeamIds = new Set(["203", "774", "773"]);

  const result = normalizeProviderFixturePayload("espn", scoreboard, { knownTeamIds });
  assert.equal(result.length, 2);
});
```

Modify `apps/ingestion-worker/test/discover-mappings-cli.test.js`: change the "defaults" test to expect:

```js
{
  providerId: "espn",
  providerName: "ESPN",
  providerBaseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world",
  providerStatus: "evaluation"
}
```

Add a test that `--provider-id api-football` and `--provider-id sportmonks` still work as explicit fallbacks (reuse the existing fixtures for those two).

- [ ] **Step 2: Verify RED**

```bash
node --test apps/ingestion-worker/test/discover-mappings.test.js apps/ingestion-worker/test/discover-mappings-cli.test.js
```

Expected: FAIL — `normalizeProviderFixturePayload` does not accept an `espn` provider id yet, and the CLI default is still `api-football`.

- [ ] **Step 3: Add the espn branch to provider-fixtures.js**

Modify `apps/ingestion-worker/src/provider/provider-fixtures.js`:

```js
import { normalizeApiFootballPayload } from "./api-football.js";
import { normalizeSportmonksLiveScore } from "./sportmonks.js";
import { normalizeEspnPayload } from "./espn.js";

export function normalizeProviderFixturePayload(providerId, payload, options = {}) {
  if (providerId === "espn") {
    return normalizeEspnPayload(payload, { knownTeamIds: options.knownTeamIds });
  }

  if (providerId === "api-football") {
    return normalizeApiFootballPayload(payload);
  }

  if (providerId === "sportmonks") {
    const fixtures = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
    return fixtures.map(normalizeSportmonksLiveScore);
  }

  throw new Error(`Unsupported provider: ${providerId}`);
}
```

- [ ] **Step 4: Switch the CLI default and add the optional teams file**

Modify `apps/ingestion-worker/src/cli/discover-mappings-core.js`:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProviderMappings } from "../mapping/discover-provider-mappings.js";
import { normalizeProviderFixturePayload } from "../provider/provider-fixtures.js";
import { normalizeEspnTeams } from "../provider/espn.js";

const DEFAULT_PROVIDER_ID = "espn";
const DEFAULT_PROVIDER_NAME = "ESPN";
const DEFAULT_PROVIDER_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const DEFAULT_PROVIDER_STATUS = "evaluation";

export function parseDiscoverMappingsArgs(argv) {
  const args = {
    providerId: DEFAULT_PROVIDER_ID,
    providerName: DEFAULT_PROVIDER_NAME,
    providerBaseUrl: DEFAULT_PROVIDER_BASE_URL,
    providerStatus: DEFAULT_PROVIDER_STATUS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--local-file") {
      args.localFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-file") {
      args.providerFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-teams-file") {
      args.providerTeamsFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-id") {
      args.providerId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-name") {
      args.providerName = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-base-url") {
      args.providerBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-status") {
      args.providerStatus = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.localFile) {
    throw new Error("--local-file is required");
  }

  if (!args.providerFile) {
    throw new Error("--provider-file is required");
  }

  return args;
}

export async function runDiscoverMappings({ argv, cwd = process.cwd() }) {
  const args = parseDiscoverMappingsArgs(argv);
  const basePath = normalizeCwd(cwd);
  const local = await readJson(path.resolve(basePath, args.localFile));
  const providerPayload = await readJson(path.resolve(basePath, args.providerFile));

  let knownTeamIds;
  if (args.providerId === "espn" && args.providerTeamsFile) {
    const teamsPayload = await readJson(path.resolve(basePath, args.providerTeamsFile));
    knownTeamIds = new Set(normalizeEspnTeams(teamsPayload).map((team) => team.providerTeamId));
  }

  const providerFixtures = normalizeProviderFixturePayload(args.providerId, providerPayload, { knownTeamIds });

  return discoverProviderMappings({
    local,
    providerFixtures,
    provider: {
      id: args.providerId,
      name: args.providerName,
      baseUrl: args.providerBaseUrl,
      status: args.providerStatus
    }
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) {
    return fileURLToPath(cwd);
  }
  return cwd;
}
```

- [ ] **Step 5: Verify GREEN**

```bash
node --test apps/ingestion-worker/test/discover-mappings.test.js apps/ingestion-worker/test/discover-mappings-cli.test.js
npm run ingestion:test
```

Expected: ESPN is the default, API-Football and Sportmonks remain available as explicit fallbacks, all worker tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/ingestion-worker/src/provider/provider-fixtures.js apps/ingestion-worker/src/cli/discover-mappings-core.js apps/ingestion-worker/test/discover-mappings.test.js apps/ingestion-worker/test/discover-mappings-cli.test.js
git commit -m "refactor: default mapping discovery to ESPN"
```

---

### Task 5: Add The ESPN Fixture+Teams Fetch CLI

**Files:**
- Create: `apps/ingestion-worker/test/fetch-espn-fixtures.test.js`
- Create: `apps/ingestion-worker/src/cli/fetch-espn-fixtures-core.js`
- Create: `apps/ingestion-worker/src/cli/fetch-espn-fixtures.js`
- Modify: `apps/ingestion-worker/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Write failing orchestration tests**

Create `apps/ingestion-worker/test/fetch-espn-fixtures.test.js`:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseFetchEspnFixturesArgs, runFetchEspnFixtures } from "../src/cli/fetch-espn-fixtures-core.js";

test("requires a date range and two output paths", () => {
  assert.throws(() => parseFetchEspnFixturesArgs([]), /--date-from is required/);
  assert.throws(
    () => parseFetchEspnFixturesArgs(["--date-from", "2026-06-18"]),
    /--date-to is required/
  );
  assert.throws(
    () => parseFetchEspnFixturesArgs(["--date-from", "2026-06-18", "--date-to", "2026-06-18"]),
    /--fixtures-output is required/
  );
  assert.throws(
    () =>
      parseFetchEspnFixturesArgs([
        "--date-from",
        "2026-06-18",
        "--date-to",
        "2026-06-18",
        "--fixtures-output",
        "out.json"
      ]),
    /--teams-output is required/
  );
});

test("fetches fixtures and teams and writes both raw payloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "espn-fetch-"));
  const fixturesPath = path.join(dir, "fixtures.json");
  const teamsPath = path.join(dir, "teams.json");

  const client = {
    fetchFixturesBetween: async () => ({ events: [{ id: "1" }] }),
    fetchTeams: async () => ({ sports: [] })
  };

  const result = await runFetchEspnFixtures({
    argv: [
      "--date-from",
      "2026-06-18",
      "--date-to",
      "2026-06-18",
      "--fixtures-output",
      fixturesPath,
      "--teams-output",
      teamsPath
    ],
    client
  });

  const writtenFixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  const writtenTeams = JSON.parse(await readFile(teamsPath, "utf8"));

  assert.deepEqual(writtenFixtures, { events: [{ id: "1" }] });
  assert.deepEqual(writtenTeams, { sports: [] });
  assert.deepEqual(result, { fixtureCount: 1, fixturesPath, teamsPath });

  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test apps/ingestion-worker/test/fetch-espn-fixtures.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the core module**

Create `apps/ingestion-worker/src/cli/fetch-espn-fixtures-core.js`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseFetchEspnFixturesArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date-from") {
      args.dateFrom = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--date-to") {
      args.dateTo = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--fixtures-output") {
      args.fixturesOutput = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--teams-output") {
      args.teamsOutput = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.dateFrom) throw new Error("--date-from is required");
  if (!args.dateTo) throw new Error("--date-to is required");
  if (!args.fixturesOutput) throw new Error("--fixtures-output is required");
  if (!args.teamsOutput) throw new Error("--teams-output is required");

  return args;
}

export async function runFetchEspnFixtures({ argv, cwd = process.cwd(), client, writeJson = writeJsonFile }) {
  const args = parseFetchEspnFixturesArgs(argv);
  const basePath = normalizeCwd(cwd);
  const fixturesPath = path.resolve(basePath, args.fixturesOutput);
  const teamsPath = path.resolve(basePath, args.teamsOutput);

  const [fixturesPayload, teamsPayload] = await Promise.all([
    client.fetchFixturesBetween({ dateFrom: args.dateFrom, dateTo: args.dateTo }),
    client.fetchTeams()
  ]);

  await writeJson(fixturesPath, fixturesPayload);
  await writeJson(teamsPath, teamsPayload);

  return {
    fixtureCount: Array.isArray(fixturesPayload?.events) ? fixturesPayload.events.length : 0,
    fixturesPath,
    teamsPath
  };
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) return fileURLToPath(cwd);
  return cwd;
}
```

- [ ] **Step 4: Create the executable CLI**

Create `apps/ingestion-worker/src/cli/fetch-espn-fixtures.js`:

```js
import { createEspnClient } from "../provider/espn-client.js";
import { runFetchEspnFixtures } from "./fetch-espn-fixtures-core.js";

const client = createEspnClient({});

const result = await runFetchEspnFixtures({ argv: process.argv.slice(2), client });
console.log(JSON.stringify(result, null, 2));
```

- [ ] **Step 5: Add npm scripts**

Add to `apps/ingestion-worker/package.json` `scripts`:

```json
"fetch-espn-fixtures": "node src/cli/fetch-espn-fixtures.js"
```

Add to root `package.json` `scripts`:

```json
"ingestion:fetch-espn-fixtures": "npm run fetch-espn-fixtures --workspace apps/ingestion-worker --"
```

ESPN needs no credentials, so this script does not need `--env-file-if-exists`.

- [ ] **Step 6: Verify tests and CLI failure behavior**

```bash
node --test apps/ingestion-worker/test/fetch-espn-fixtures.test.js
npm run ingestion:fetch-espn-fixtures --
```

Expected: the test passes; the real CLI exits non-zero with `--date-from is required` before making a network request.

- [ ] **Step 7: Commit**

```bash
git add package.json apps/ingestion-worker/package.json apps/ingestion-worker/src/cli/fetch-espn-fixtures* apps/ingestion-worker/test/fetch-espn-fixtures.test.js
git commit -m "feat: add ESPN fixture and teams fetch CLI"
```

---

### Task 6: Add ESPN Live Sync And Switch The Offline Dry Run

**Files:**
- Create: `apps/ingestion-worker/test/sync-espn-live.test.js`
- Create: `apps/ingestion-worker/src/cli/sync-espn-live-core.js`
- Create: `apps/ingestion-worker/src/cli/sync-espn-live.js`
- Modify: `apps/ingestion-worker/src/cli/dry-run.js`
- Modify: `apps/ingestion-worker/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Write failing live-sync orchestration tests**

Create `apps/ingestion-worker/test/sync-espn-live.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runSyncEspnLive } from "../src/cli/sync-espn-live-core.js";

function buildClient(scoreboardPayload, teamsPayload) {
  return {
    fetchFixturesBetween: async () => scoreboardPayload,
    fetchTeams: async () => teamsPayload
  };
}

function buildStore({ mappings, applyError } = {}) {
  const applied = [];
  const runs = [];
  return {
    applied,
    runs,
    async loadProviderMappings() {
      return mappings;
    },
    async applyLiveScorePlan(plan) {
      if (applyError) throw applyError;
      applied.push(plan);
      return { fixtureId: plan.fixture.id, eventsChanged: plan.events.length };
    },
    async recordIngestionRun(run) {
      runs.push(run);
      return "run-id";
    }
  };
}

const scoreboard = {
  events: [
    {
      id: "760415",
      date: "2026-06-11T19:00Z",
      season: { year: 2026 },
      competitions: [
        {
          venue: { id: "1672", fullName: "Estadio Banorte" },
          altGameNote: "FIFA World Cup, Group A",
          status: { clock: 5400, type: { name: "STATUS_FULL_TIME" } },
          competitors: [
            { homeAway: "home", score: "2", team: { id: "203", displayName: "Mexico", abbreviation: "MEX" } },
            { homeAway: "away", score: "0", team: { id: "774", displayName: "South Africa", abbreviation: "RSA" } }
          ],
          details: []
        }
      ]
    }
  ]
};

const teams = {
  sports: [
    {
      leagues: [
        {
          teams: [
            { team: { id: "203", displayName: "Mexico", abbreviation: "MEX" } },
            { team: { id: "774", displayName: "South Africa", abbreviation: "RSA" } }
          ]
        }
      ]
    }
  ]
};

const mappings = {
  fixtureByProviderId: new Map([["760415", "A-2"]]),
  teamByProviderId: new Map([
    ["203", "MEX"],
    ["774", "RSA"]
  ])
};

test("dry-run mode builds plans without writing", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings });

  const result = await runSyncEspnLive({ argv: [], client, store });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.fixtureCount, 1);
  assert.equal(store.applied.length, 0);
  assert.equal(store.runs.length, 0);
});

test("apply mode writes each plan and records a completed run", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings });

  const result = await runSyncEspnLive({ argv: ["--apply"], client, store });

  assert.equal(result.mode, "apply");
  assert.equal(store.applied.length, 1);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].status, "completed");
  assert.equal(store.runs[0].source, "espn");
});

test("apply mode records a failed run and rethrows on write failure", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings, applyError: new Error("boom") });

  await assert.rejects(runSyncEspnLive({ argv: ["--apply"], client, store }), /boom/);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].status, "failed");
});

test("rejects an unmapped provider fixture before any write", async () => {
  const client = buildClient(scoreboard, teams);
  const store = buildStore({ mappings: { fixtureByProviderId: new Map(), teamByProviderId: new Map() } });

  await assert.rejects(runSyncEspnLive({ argv: ["--apply"], client, store }), /No local fixture mapping/);
  assert.equal(store.applied.length, 0);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test apps/ingestion-worker/test/sync-espn-live.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the live sync core**

Create `apps/ingestion-worker/src/cli/sync-espn-live-core.js`:

```js
import { normalizeEspnPayload, normalizeEspnTeams } from "../provider/espn.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

export function parseSyncEspnLiveArgs(argv) {
  let apply = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply };
}

export async function runSyncEspnLive({ argv, client, store, today = new Date() }) {
  const { apply } = parseSyncEspnLiveArgs(argv);
  const { dateFrom, dateTo } = pollWindow(today);

  const [scoreboardPayload, teamsPayload] = await Promise.all([
    client.fetchFixturesBetween({ dateFrom, dateTo }),
    client.fetchTeams()
  ]);

  const knownTeamIds = new Set(normalizeEspnTeams(teamsPayload).map((team) => team.providerTeamId));
  const fixtures = normalizeEspnPayload(scoreboardPayload, { knownTeamIds });
  const mappings = await store.loadProviderMappings("espn");
  const plans = fixtures.map((fixture) => buildLiveScoreUpsertPlan(fixture, mappings));

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id)
  };

  if (!apply) {
    return { ...summary, plans };
  }

  let rowsChanged = 0;
  try {
    for (const plan of plans) {
      await store.applyLiveScorePlan(plan);
      rowsChanged += 1;
    }

    await store.recordIngestionRun({
      source: "espn",
      status: "completed",
      rowsSeen: plans.length,
      rowsChanged,
      errorMessage: null,
      metadata: {}
    });
  } catch (error) {
    try {
      await store.recordIngestionRun({
        source: "espn",
        status: "failed",
        rowsSeen: plans.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: {}
      });
    } catch {
      // Preserve the sync failure even if observability storage is unavailable.
    }
    throw error;
  }

  return summary;
}

function pollWindow(today) {
  const previousDay = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return {
    dateFrom: previousDay.toISOString().slice(0, 10),
    dateTo: nextDay.toISOString().slice(0, 10)
  };
}
```

The `±1 day` window absorbs matches near the UTC day boundary without needing per-match scheduling logic; the external scheduler is what owns the 10-15 minute repeat cadence, this command just does one poll.

- [ ] **Step 4: Create the executable CLI**

Create `apps/ingestion-worker/src/cli/sync-espn-live.js`:

```js
import { createEspnClient } from "../provider/espn-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { runSyncEspnLive } from "./sync-espn-live-core.js";

const client = createEspnClient({});
const store = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});

const result = await runSyncEspnLive({ argv: process.argv.slice(2), client, store });
console.log(JSON.stringify(result, null, 2));
```

- [ ] **Step 5: Switch the offline dry run to ESPN**

Modify `apps/ingestion-worker/src/cli/dry-run.js`:

```js
import { readFile } from "node:fs/promises";
import { normalizeEspnFixture } from "../provider/espn.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

const payload = JSON.parse(
  await readFile(new URL("../../test/fixtures/espn-scoreboard.sample.json", import.meta.url), "utf8")
);

const normalized = normalizeEspnFixture(payload.events[0]);
const plan = buildLiveScoreUpsertPlan(normalized, {
  fixtureByProviderId: new Map([["760415", "A-2"]]),
  teamByProviderId: new Map([
    ["203", "MEX"],
    ["774", "RSA"]
  ])
});

console.log(JSON.stringify({ normalized, plan }, null, 2));
```

- [ ] **Step 6: Add npm scripts**

Worker `package.json`:

```json
"sync-espn-live": "node --env-file-if-exists=.env.local src/cli/sync-espn-live.js"
```

Root `package.json`:

```json
"ingestion:sync-espn-live": "npm run sync-espn-live --workspace apps/ingestion-worker --"
```

`--env-file-if-exists` is kept here only because the Supabase write credentials still come from `.env.local`; the ESPN client itself needs no key.

- [ ] **Step 7: Verify GREEN and the offline demo**

```bash
node --test apps/ingestion-worker/test/sync-espn-live.test.js
npm run ingestion:test
npm run ingestion:dry-run
```

Expected: tests pass; dry-run JSON reports provider `espn`, fixture `A-2`, score `2-0`, two goal events for Mexico.

- [ ] **Step 8: Commit**

```bash
git add package.json apps/ingestion-worker/package.json apps/ingestion-worker/src/cli/sync-espn-live* apps/ingestion-worker/src/cli/dry-run.js apps/ingestion-worker/test/sync-espn-live.test.js
git commit -m "feat: add ESPN live sync command"
```

---

### Task 7: Add The football-data.org Reconciliation CLI (Read-Only)

**Files:**
- Create: `apps/ingestion-worker/test/compare-football-data.test.js`
- Create: `apps/ingestion-worker/src/cli/compare-football-data-core.js`
- Create: `apps/ingestion-worker/src/cli/compare-football-data.js`
- Modify: `apps/ingestion-worker/test/supabase-writer.test.js`
- Modify: `apps/ingestion-worker/src/storage/supabase-writer.js`
- Modify: `apps/ingestion-worker/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Add a failing test for the canonical-fixture read**

Add to `apps/ingestion-worker/test/supabase-writer.test.js`:

```js
test("loadCanonicalFixtures reads fixture cards for reconciliation", async () => {
  const rows = [
    { id: "A-2", kickoff_at: "2026-06-11T19:00:00Z", status: "final", home_goals: 2, away_goals: 0, home_team_id: "MEX", away_team_id: "RSA" }
  ];
  const client = {
    from(table) {
      assert.equal(table, "fixture_cards");
      return {
        select() {
          return Promise.resolve({ data: rows, error: null });
        }
      };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadCanonicalFixtures();
  assert.deepEqual(result, rows);
});
```

This test sits alongside the existing `provider_fixture_mappings`/`provider_team_mappings` tests already in this file. The file already imports `assert` from `node:assert/strict` and `createSupabaseWriter` from `../src/storage/supabase-writer.js` at the top — no new imports are needed.

- [ ] **Step 2: Verify RED, then implement the read**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js
```

Expected: FAIL — `loadCanonicalFixtures` is not a function. Add to `createSupabaseWriter`'s returned object in `apps/ingestion-worker/src/storage/supabase-writer.js` (alongside `loadProviderMappings`):

```js
async loadCanonicalFixtures() {
  const result = await client
    .from("fixture_cards")
    .select("id,kickoff_at,status,home_goals,away_goals,home_team_id,away_team_id");

  if (result.error) {
    throw result.error;
  }

  return result.data ?? [];
},
```

Run again to verify GREEN:

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js
```

- [ ] **Step 3: Write failing reconciliation-diff tests**

Create `apps/ingestion-worker/test/compare-football-data.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildReconciliationDiff } from "../src/cli/compare-football-data-core.js";

const canonicalFixtures = [
  { id: "A-2", kickoff_at: "2026-06-11T19:00:00Z", status: "final", home_goals: 2, away_goals: 0, home_team_id: "MEX", away_team_id: "RSA" },
  { id: "A-5", kickoff_at: "2026-06-18T16:00:00Z", status: "scheduled", home_goals: null, away_goals: null, home_team_id: "RSA", away_team_id: "CZE" }
];

const canonicalTeamNamesById = new Map([
  ["MEX", "Mexico"],
  ["RSA", "South Africa"],
  ["CZE", "Czechia"]
]);

test("matches a finished football-data.org match with agreeing score and status", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "537327", kickoffAt: "2026-06-11T19:00:00Z", status: "final", home: { name: "Mexico", goals: 2 }, away: { name: "South Africa", goals: 0 } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.deepEqual(diff, [
    { providerFixtureId: "537327", localFixtureId: "A-2", agrees: true, differences: [] }
  ]);
});

test("flags a score disagreement", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "537327", kickoffAt: "2026-06-11T19:00:00Z", status: "final", home: { name: "Mexico", goals: 3 }, away: { name: "South Africa", goals: 0 } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.equal(diff[0].agrees, false);
  assert.deepEqual(diff[0].differences, ["home_goals: local=2 football-data=3"]);
});

test("reports an unmatched football-data.org fixture", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "999999", kickoffAt: "2099-01-01T00:00:00Z", status: "scheduled", home: { name: "Nowhere", goals: null }, away: { name: "Nobody", goals: null } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.deepEqual(diff, [
    { providerFixtureId: "999999", localFixtureId: null, agrees: false, differences: ["no canonical fixture matched this kickoff/participants"] }
  ]);
});
```

- [ ] **Step 4: Verify RED, then implement the diff builder**

```bash
node --test apps/ingestion-worker/test/compare-football-data.test.js
```

Expected: FAIL because the module does not exist. Create `apps/ingestion-worker/src/cli/compare-football-data-core.js`:

```js
import { createFootballDataClient } from "../provider/football-data-client.js";
import { normalizeFootballDataPayload } from "../provider/football-data.js";

export function parseCompareFootballDataArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date-from") {
      args.dateFrom = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--date-to") {
      args.dateTo = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.dateFrom) throw new Error("--date-from is required");
  if (!args.dateTo) throw new Error("--date-to is required");

  return args;
}

export function buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById }) {
  return footballDataMatches.map((match) => {
    const local = canonicalFixtures.find(
      (fixture) =>
        normalizeInstant(fixture.kickoff_at) === normalizeInstant(match.kickoffAt) &&
        normalizeName(canonicalTeamNamesById.get(fixture.home_team_id)) === normalizeName(match.home.name) &&
        normalizeName(canonicalTeamNamesById.get(fixture.away_team_id)) === normalizeName(match.away.name)
    );

    if (!local) {
      return {
        providerFixtureId: match.providerFixtureId,
        localFixtureId: null,
        agrees: false,
        differences: ["no canonical fixture matched this kickoff/participants"]
      };
    }

    const differences = [];
    if (local.status !== match.status) {
      differences.push(`status: local=${local.status} football-data=${match.status}`);
    }
    if (local.home_goals !== match.home.goals) {
      differences.push(`home_goals: local=${local.home_goals} football-data=${match.home.goals}`);
    }
    if (local.away_goals !== match.away.goals) {
      differences.push(`away_goals: local=${local.away_goals} football-data=${match.away.goals}`);
    }

    return {
      providerFixtureId: match.providerFixtureId,
      localFixtureId: local.id,
      agrees: differences.length === 0,
      differences
    };
  });
}

export async function runCompareFootballData({ argv, client, store }) {
  const args = parseCompareFootballDataArgs(argv);
  const payload = await client.fetchFixturesBetween({ dateFrom: args.dateFrom, dateTo: args.dateTo });
  const footballDataMatches = normalizeFootballDataPayload(payload);
  const canonicalFixtures = await store.loadCanonicalFixtures();
  const canonicalTeamNamesById = await store.loadTeamNamesById();

  return buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });
}

function normalizeInstant(value) {
  return new Date(value).toISOString();
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
```

- [ ] **Step 5: Add the team-names read this CLI needs**

Add a failing test to `apps/ingestion-worker/test/supabase-writer.test.js`:

```js
test("loadTeamNamesById reads the teams table as a name lookup", async () => {
  const client = {
    from(table) {
      assert.equal(table, "teams");
      return { select: () => Promise.resolve({ data: [{ id: "MEX", name: "Mexico" }], error: null }) };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadTeamNamesById();
  assert.deepEqual(result, new Map([["MEX", "Mexico"]]));
});
```

Add to `createSupabaseWriter` in `apps/ingestion-worker/src/storage/supabase-writer.js`:

```js
async loadTeamNamesById() {
  const result = await client.from("teams").select("id,name");

  if (result.error) {
    throw result.error;
  }

  return new Map((result.data ?? []).map((row) => [row.id, row.name]));
},
```

- [ ] **Step 6: Create the executable CLI**

Create `apps/ingestion-worker/src/cli/compare-football-data.js`:

```js
import { createFootballDataClient } from "../provider/football-data-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { runCompareFootballData } from "./compare-football-data-core.js";

const client = createFootballDataClient({ apiToken: process.env.FOOTBALL_DATA_API_TOKEN });
const store = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});

const diff = await runCompareFootballData({ argv: process.argv.slice(2), client, store });
console.log(JSON.stringify(diff, null, 2));
```

This CLI never calls `applyLiveScorePlan` — it only reads and prints. There is no `--apply` flag because there is nothing to apply.

- [ ] **Step 7: Add npm scripts**

Worker `package.json`:

```json
"compare-football-data": "node --env-file-if-exists=.env.local src/cli/compare-football-data.js"
```

Root `package.json`:

```json
"ingestion:compare-football-data": "npm run compare-football-data --workspace apps/ingestion-worker --"
```

- [ ] **Step 8: Verify GREEN**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js apps/ingestion-worker/test/compare-football-data.test.js
npm run ingestion:test
```

- [ ] **Step 9: Commit**

```bash
git add package.json apps/ingestion-worker/package.json apps/ingestion-worker/src/storage/supabase-writer.js apps/ingestion-worker/src/cli/compare-football-data* apps/ingestion-worker/test/supabase-writer.test.js apps/ingestion-worker/test/compare-football-data.test.js
git commit -m "feat: add football-data.org reconciliation report"
```

---

### Task 8: Record The Provider Switch In Supabase

**Files:**
- Create: generated `supabase/migrations/*_select_espn_provider.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new select_espn_provider
```

- [ ] **Step 2: Add the provider transition SQL**

Put this in the generated migration:

```sql
insert into public.data_providers (id, name, base_url, status, notes)
values (
  'espn',
  'ESPN (unofficial)',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world',
  'evaluation',
  'Primary World Cup 2026 source. Free, keyless, undocumented/unofficial endpoint reverse-engineered from espn.com. Activate after fixture dry run and shadow validation.'
)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  status = excluded.status,
  notes = excluded.notes;

insert into public.data_providers (id, name, base_url, status, notes)
values (
  'football-data',
  'football-data.org',
  'https://api.football-data.org/v4',
  'evaluation',
  'Reconciliation-only fallback. Official, free-tier-eligible, but its World Cup response has no goal-event data, so it never receives canonical writes.'
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
  notes = 'Free plan rejects the 2026 season ("Free plans do not have access to this season, try from 2022 to 2024."). Kept as a dormant adapter in case of a future paid upgrade.'
where id = 'api-football';
```

Do not touch the `sportmonks` row or any grants/functions from earlier migrations — those already exist and are unaffected by this provider switch.

- [ ] **Step 3: Mirror the final seed state in schema.sql**

Find the existing `insert into public.data_providers ... where id = 'api-football'` block in `supabase/schema.sql` (added by the previous migration) and replace it with the same three statements from Step 2, so a fresh database ends up in the same final state as the linked project after this migration runs.

- [ ] **Step 4: Verify migration structure**

```bash
npx supabase migration list --local
```

Expected: the new migration is listed. If the local Docker stack is not running, record that exact limitation in `docs/deployment.md` rather than skipping the note.

- [ ] **Step 5: Apply to the linked project**

```bash
npx supabase db push --linked
```

Expected: only the new migration applies. Verify with:

```bash
echo "select id, name, status from public.data_providers order by id;" > /tmp/q.sql
npx supabase db query --linked --output json -f /tmp/q.sql
```

Expected JSON shows `espn` and `football-data` as `evaluation`, `api-football` as `disabled`, `sportmonks` unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql supabase/migrations
git commit -m "chore: select ESPN as primary provider, disable API-Football"
```

---

### Task 9: Update Docs, Verify Everything, And Confirm The UI Shows Real Data

**Files:**
- Modify: `apps/ingestion-worker/.env.local.example`
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/superpowers/specs/2026-06-17-live-data-ingestion-design.md`

- [ ] **Step 1: Update the worker environment example**

```text
FOOTBALL_DATA_API_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

ESPN needs no entry here since it takes no credential. Leave `API_FOOTBALL_API_KEY=` present but add a comment line above it noting it is a dormant fallback.

- [ ] **Step 2: Update the live ingestion design doc**

In `docs/superpowers/specs/2026-06-17-live-data-ingestion-design.md`, replace the API-Football recommendation with: ESPN (keyless, unofficial) is primary; football-data.org is a reconciliation-only fallback with no event data; API-Football is disabled because its free plan excludes the 2026 season; polling is a fixed 10-15 minute interval owned by the external scheduler, with no quota-reservation logic because ESPN has no documented daily cap.

- [ ] **Step 3: Document operator commands in `docs/deployment.md` and summarize in `README.md`**

```bash
npm run ingestion:fetch-espn-fixtures -- \
  --date-from 2026-06-18 \
  --date-to 2026-06-18 \
  --fixtures-output .local-data/espn/fixtures-2026-06-18.json \
  --teams-output .local-data/espn/teams-2026-06-18.json

npm run ingestion:discover-mappings -- \
  --local-file path/to/local-tournament.json \
  --provider-file .local-data/espn/fixtures-2026-06-18.json \
  --provider-teams-file .local-data/espn/teams-2026-06-18.json

npm run ingestion:sync-espn-live
npm run ingestion:sync-espn-live -- --apply

npm run ingestion:compare-football-data -- --date-from 2026-06-18 --date-to 2026-06-18
```

State explicitly: ESPN needs no API key; `FOOTBALL_DATA_API_TOKEN` is only needed for the reconciliation command; the external scheduler should invoke `sync-espn-live` every 10-15 minutes; `compare-football-data` never writes and can run on a much slower cadence (e.g., once daily).

- [ ] **Step 4: Replace the validation-gate status**

Replace the API-Football "Validation Gate" section in `docs/deployment.md` with an "ESPN Validation Gate" covering: fixture count and competition identity, participant/kickoff agreement, status timing, goal-event completeness (and the known absence of assists), final-result correction behavior, and the unofficial-source risk acknowledgment. Mark the actual run status `Not run yet` until Step 6 below produces real evidence, then update it.

- [ ] **Step 5: Run all offline verification**

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

Expected: every command exits `0`.

- [ ] **Step 6: Run the real, credential-light validation**

```bash
npm run ingestion:fetch-espn-fixtures -- \
  --date-from 2026-06-18 \
  --date-to 2026-06-25 \
  --fixtures-output .local-data/espn/fixtures-2026-06-18.json \
  --teams-output .local-data/espn/teams-2026-06-18.json

npm run ingestion:discover-mappings -- \
  --local-file apps/ingestion-worker/test/fixtures/local-tournament.sample.json \
  --provider-file .local-data/espn/fixtures-2026-06-18.json \
  --provider-teams-file .local-data/espn/teams-2026-06-18.json \
  --provider-id espn \
  --provider-name ESPN \
  --provider-base-url https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world
```

Review the mapping output before importing. If the real tournament fixture set differs from the sample local fixture file, use the real canonical tournament export instead of weakening the name/kickoff matching.

```bash
npm run ingestion:import-mappings -- --file path/to/reviewed-mappings.json --apply
npm run ingestion:sync-espn-live
npm run ingestion:sync-espn-live -- --apply
```

Expected: the dry run prints write plans with real fixture IDs and scores; `--apply` updates canonical `fixtures`/`match_events` rows; rerunning is idempotent (no duplicate event rows) because `match_events` already dedupes on `(source, source_event_id)`.

- [ ] **Step 7: Confirm the UI renders the real data**

```bash
echo "NEXT_PUBLIC_SUPABASE_URL=<same project URL>" 
echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>"
```

(These should already be in `apps/web/.env.local` from the earlier verification session.) Start the web app:

```bash
npm run dev --workspace apps/web
```

Open the fixtures view in a browser and confirm: at least one match shows a real, non-seed score and goal scorer pulled from this session's `--apply` run, and the page's data `source` indicator (if surfaced in the UI) reads `supabase`, not the static seed fallback. Stop the dev server when done.

- [ ] **Step 8: Record validation evidence and commit**

Replace the `Not run yet` status in `docs/deployment.md` with the date, fixture IDs touched, observed event completeness (noting assists are always absent), and the UI confirmation from Step 7.

```bash
git add README.md docs apps/ingestion-worker/.env.local.example
git commit -m "docs: document ESPN provider operations and validation evidence"
```
