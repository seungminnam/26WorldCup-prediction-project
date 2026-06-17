import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveScoreUpsertPlan } from "../src/sync/live-score.js";

test("builds an idempotent fixture and event upsert plan", () => {
  const normalized = {
    provider: "sportmonks",
    providerFixtureId: "991001",
    kickoffAt: "2026-06-12T19:00:00Z",
    status: "final",
    home: {
      providerTeamId: "7001",
      name: "Korea Republic",
      goals: 2
    },
    away: {
      providerTeamId: "7002",
      name: "Czechia",
      goals: 1
    },
    events: [
      {
        providerEventId: "880001",
        providerTeamId: "7001",
        playerName: "Lee Kang-in",
        minute: 32,
        stoppageMinute: null,
        eventType: "goal"
      }
    ]
  };

  const mappings = {
    fixtureByProviderId: new Map([["991001", "A-2"]]),
    teamByProviderId: new Map([
      ["7001", "KOR"],
      ["7002", "CZE"]
    ])
  };

  const plan = buildLiveScoreUpsertPlan(normalized, mappings);

  assert.deepEqual(plan.fixture, {
    id: "A-2",
    status: "final",
    home_goals: 2,
    away_goals: 1,
    result_verified_at: null,
    source: "sportmonks"
  });

  assert.deepEqual(plan.events, [
    {
      fixture_id: "A-2",
      team_id: "KOR",
      player_name: "Lee Kang-in",
      minute: 32,
      stoppage_minute: null,
      event_type: "goal",
      source_event_id: "880001",
      is_confirmed: true,
      source: "sportmonks",
      source_url: null
    }
  ]);
});
