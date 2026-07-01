import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveScoreUpsertPlan } from "../src/sync/live-score.js";

const mappings = {
  fixtureByProviderId: new Map([["1199001", "A-2"]]),
  teamByProviderId: new Map([
    ["7001", "KOR"],
    ["7002", "CZE"]
  ])
};

test("builds a penalty shootout fixture and assisted goal event plan", () => {
  const plan = buildLiveScoreUpsertPlan(makeNormalized(), mappings);

  assert.deepEqual(plan.fixture, {
    id: "A-2",
    status: "final",
    home_goals: 2,
    away_goals: 2,
    home_penalties: 4,
    away_penalties: 3,
    winner_team_id: "KOR",
    elapsed_minutes: null,
    result_verified_at: null,
    source: "api-football"
  });
  assert.deepEqual(Object.keys(plan.fixture).sort(), [
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
  assert.deepEqual(plan.events, [
    {
      fixture_id: "A-2",
      team_id: "KOR",
      player_name: "Lee Kang-in",
      assist_player_name: "Son Heung-min",
      minute: 32,
      stoppage_minute: null,
      event_type: "goal",
      source_event_id: "1199001:7001:32:0:Goal:Normal Goal:801",
      is_confirmed: true,
      source: "api-football",
      source_url: null
    }
  ]);
});

test("clears canonical score fields for non-score states", () => {
  for (const status of ["scheduled", "postponed", "result_pending"]) {
    const plan = buildLiveScoreUpsertPlan(
      makeNormalized({
        status,
        homeGoals: null,
        awayGoals: null,
        homePenalties: null,
        awayPenalties: null,
        events: []
      }),
      mappings
    );

    assert.deepEqual(plan.fixture, {
      id: "A-2",
      status,
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: null,
      elapsed_minutes: null,
      result_verified_at: null,
      source: "api-football"
    });
  }
});

test("keeps a final draw without a winner", () => {
  const plan = buildLiveScoreUpsertPlan(
    makeNormalized({ homePenalties: null, awayPenalties: null, events: [] }),
    mappings
  );

  assert.equal(plan.fixture.winner_team_id, null);
});

test("selects the higher-scoring team for a final without penalties", () => {
  const plan = buildLiveScoreUpsertPlan(
    makeNormalized({
      homeGoals: 1,
      awayGoals: 2,
      homePenalties: null,
      awayPenalties: null,
      events: []
    }),
    mappings
  );

  assert.equal(plan.fixture.winner_team_id, "CZE");
});

function makeNormalized({
  status = "final",
  homeGoals = 2,
  awayGoals = 2,
  homePenalties = 4,
  awayPenalties = 3,
  events = [
    {
      providerEventId: "1199001:7001:32:0:Goal:Normal Goal:801",
      providerTeamId: "7001",
      playerName: "Lee Kang-in",
      assistPlayerName: "Son Heung-min",
      minute: 32,
      stoppageMinute: null,
      eventType: "goal"
    }
  ]
} = {}) {
  return {
    provider: "api-football",
    providerFixtureId: "1199001",
    kickoffAt: "2026-06-12T19:00:00+00:00",
    status,
    home: {
      providerTeamId: "7001",
      name: "Korea Republic",
      goals: homeGoals,
      penalties: homePenalties
    },
    away: {
      providerTeamId: "7002",
      name: "Czechia",
      goals: awayGoals,
      penalties: awayPenalties
    },
    events
  };
}

test("uses shootout goals to determine a tied knockout winner", () => {
  const plan = buildLiveScoreUpsertPlan(
    {
      provider: "espn",
      providerFixtureId: "760510",
      status: "final",
      home: { providerTeamId: "1", goals: 1, penalties: 4 },
      away: { providerTeamId: "2", goals: 1, penalties: 3 },
      events: []
    },
    {
      fixtureByProviderId: new Map([["760510", "M-98"]]),
      teamByProviderId: new Map([
        ["1", "BRA"],
        ["2", "ARG"]
      ])
    }
  );

  assert.equal(plan.fixture.home_penalties, 4);
  assert.equal(plan.fixture.away_penalties, 3);
  assert.equal(plan.fixture.winner_team_id, "BRA");
});
