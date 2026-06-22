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
  fixtureByProviderId: new Map([["760415", "A-1"]]),
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
  assert.deepEqual(store.runs[0].metadata, { skipped: result.skipped, drift: [] });
});

test("applies completed fixtures while ignoring scheduled fixtures", async () => {
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
  assert.deepEqual(result.fixtureIds, ["A-1"]);
  assert.deepEqual(result.skipped, []);
  assert.equal(store.applied.length, 1);
});
