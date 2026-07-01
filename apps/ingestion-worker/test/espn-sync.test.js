import assert from "node:assert/strict";
import test from "node:test";
import { syncEspnResults } from "../src/sync/espn-results.js";

test("applies final results without writing fixed schedule fields", async () => {
  const applied = [];
  const result = await syncEspnResults({
    events: [fixture("MEX", "RSA")],
    canonicalFixtures: [canonical("MEX", "RSA")],
    mappings: {
      fixtureByProviderId: new Map([["760415", "A-1"]]),
      teamByProviderId: new Map([
        ["203", "MEX"],
        ["467", "RSA"]
      ])
    },
    writer: { applyLiveScorePlan: async (plan) => applied.push(plan) }
  });

  assert.equal(result.appliedCount, 1);
  assert.deepEqual(Object.keys(applied[0].fixture).sort(), [
    "away_goals",
    "away_penalties",
    "elapsed_minutes",
    "home_goals",
    "home_penalties",
    "id",
    "result_verified_at",
    "source",
    "status",
    "winner_team_id"
  ]);
});

test("refuses a result when fixed participants drift", async () => {
  const result = await syncEspnResults({
    events: [fixture("RSA", "MEX")],
    canonicalFixtures: [canonical("MEX", "RSA")],
    mappings: {
      fixtureByProviderId: new Map([["760415", "A-1"]]),
      teamByProviderId: new Map([
        ["203", "MEX"],
        ["467", "RSA"]
      ])
    },
    writer: { applyLiveScorePlan: async () => assert.fail("must not write participant drift") }
  });

  assert.equal(result.appliedCount, 0);
  assert.equal(result.rejected[0].fields[0], "participants");
});

function canonical(homeTeamId, awayTeamId) {
  return {
    id: "A-1",
    espnFixtureId: "760415",
    kickoff: "2026-06-11T19:00:00.000Z",
    venue: "Mexico City",
    homeTeamId,
    awayTeamId
  };
}

function fixture(homeCode, awayCode) {
  const teams = {
    MEX: { id: "203", abbreviation: "MEX", displayName: "Mexico" },
    RSA: { id: "467", abbreviation: "RSA", displayName: "South Africa" }
  };
  return {
    id: "760415",
    date: "2026-06-11T19:00Z",
    competitions: [
      {
        venue: { fullName: "Estadio Banorte" },
        status: { type: { state: "post" } },
        competitors: [
          { homeAway: "home", score: "2", team: teams[homeCode] },
          { homeAway: "away", score: "0", team: teams[awayCode] }
        ],
        details: []
      }
    ]
  };
}
