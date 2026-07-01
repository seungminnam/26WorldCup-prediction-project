import assert from "node:assert/strict";
import test from "node:test";
import { mapFixtureRows } from "../lib/tournament-data-core.ts";

test("keeps knockout fixtures with fixed slots and unknown teams", () => {
  const fixtures = mapFixtureRows(
    [
      {
        id: "M-73",
        match_number: 73,
        group_code: null,
        stage: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "scheduled",
        home_goals: null,
        away_goals: null,
        venue_name: "SoFi Stadium",
        venue_city: "Los Angeles",
        home_team_id: null,
        away_team_id: null,
        home_slot: "2A",
        away_slot: "2B"
      }
    ],
    []
  );

  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].homeSlot, "2A");
  assert.equal(fixtures[0].awaySlot, "2B");
  assert.equal(fixtures[0].venue, "SoFi Stadium");
});

test("maps shootout scores for completed knockout fixtures", () => {
  const [fixture] = mapFixtureRows(
    [{
      id: "M-98",
      match_number: 98,
      group_code: null,
      stage: "quarterfinal",
      kickoff_at: "2026-07-09T20:00:00Z",
      status: "final",
      home_goals: 1,
      away_goals: 1,
      home_penalties: 4,
      away_penalties: 3,
      venue_name: "Gillette Stadium",
      venue_city: "Boston",
      home_team_id: "BRA",
      away_team_id: "ARG",
      home_slot: "W93",
      away_slot: "W94"
    }],
    [
      {
        fixture_id: "M-98",
        team_id: "BRA",
        player_name: "Casemiro",
        minute: 120,
        stoppage_minute: null,
        event_type: "penalty_goal"
      },
      {
        fixture_id: "M-98",
        team_id: "ARG",
        player_name: "Lionel Messi",
        minute: 120,
        stoppage_minute: null,
        event_type: "penalty_miss"
      }
    ]
  );

  assert.equal(fixture.homePenalties, 4);
  assert.equal(fixture.awayPenalties, 3);
  assert.deepEqual(fixture.shootoutEvents, [
    { teamId: "BRA", player: "Casemiro", minute: 120, eventType: "penalty_goal" },
    { teamId: "ARG", player: "Lionel Messi", minute: 120, eventType: "penalty_miss" }
  ]);
});

test("separates card events from goal events into a distinct cards array", () => {
  const [fixture] = mapFixtureRows(
    [
      {
        id: "A-1",
        match_number: 1,
        group_code: "A",
        stage: "group",
        kickoff_at: "2026-06-11T19:00:00Z",
        status: "final",
        home_goals: 2,
        away_goals: 0,
        venue_name: "Estadio Banorte",
        venue_city: "Mexico City",
        home_team_id: "MEX",
        away_team_id: "RSA",
        home_slot: "MEX",
        away_slot: "RSA"
      }
    ],
    [
      { fixture_id: "A-1", team_id: "MEX", player_name: "Julián Quiñones", minute: 9, event_type: "goal" },
      { fixture_id: "A-1", team_id: "RSA", player_name: "Some Defender", minute: 17, event_type: "yellow_card" },
      { fixture_id: "A-1", team_id: "RSA", player_name: "Some Striker", minute: 80, event_type: "red_card" }
    ]
  );

  assert.deepEqual(fixture.scorers, [{ teamId: "MEX", player: "Julián Quiñones", minute: 9, eventType: "goal" }]);
  assert.deepEqual(fixture.cards, [
    { teamId: "RSA", player: "Some Defender", minute: 17, eventType: "yellow_card" },
    { teamId: "RSA", player: "Some Striker", minute: 80, eventType: "red_card" }
  ]);
});

test("keeps stoppage minutes on goal events", () => {
  const [fixture] = mapFixtureRows(
    [
      {
        id: "A-2",
        match_number: 2,
        group_code: "A",
        stage: "group",
        kickoff_at: "2026-06-12T01:00:00Z",
        status: "final",
        home_goals: 1,
        away_goals: 0,
        venue_name: "BC Place",
        venue_city: "Vancouver",
        home_team_id: "CAN",
        away_team_id: "QAT",
        home_slot: "CAN",
        away_slot: "QAT"
      }
    ],
    [
      {
        fixture_id: "A-2",
        team_id: "CAN",
        player_name: "Jonathan David",
        minute: 90,
        stoppage_minute: 2,
        event_type: "goal"
      }
    ]
  );

  assert.deepEqual(fixture.scorers, [
    { teamId: "CAN", player: "Jonathan David", minute: 90, eventType: "goal", stoppageMinute: 2 }
  ]);
});
