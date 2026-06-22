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
    []
  );

  assert.equal(fixture.homePenalties, 4);
  assert.equal(fixture.awayPenalties, 3);
});
