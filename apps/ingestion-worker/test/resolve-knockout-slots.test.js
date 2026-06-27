import assert from "node:assert/strict";
import test from "node:test";

import { teams } from "@wc/tournament-engine/data";
import { fixtures as groupFixtures } from "@wc/tournament-engine/data";
import { knockoutFixtures } from "@wc/tournament-engine/data";
import { buildResolveKnockoutSlotsPlan, resolveKnockoutSlots } from "../src/sync/resolve-knockout-slots.js";

function buildTeamRows() {
  return teams.map((team) => ({
    id: team.id,
    group_code: team.group,
    rating: team.rating,
    fifa_ranking: team.fifaRanking
  }));
}

function buildFixtureRows() {
  const groupRows = groupFixtures.map((fixture, index) => {
    const teamsInGroup = teams.filter((team) => team.group === fixture.group).sort((a, b) => a.id.localeCompare(b.id));
    const homeIndex = teamsInGroup.findIndex((team) => team.id === fixture.homeTeamId);
    const awayIndex = teamsInGroup.findIndex((team) => team.id === fixture.awayTeamId);
    const [homeGoals, awayGoals] = homeIndex < awayIndex ? [2, 0] : [0, 2];
    return {
      id: `G-${index}`,
      match_number: 1000 + index,
      group_code: fixture.group,
      home_team_id: fixture.homeTeamId,
      away_team_id: fixture.awayTeamId,
      home_goals: homeGoals,
      away_goals: awayGoals,
      winner_team_id: null
    };
  });
  const knockoutRows = knockoutFixtures.map((fixture) => ({
    id: `M-${fixture.matchNumber}`,
    match_number: fixture.matchNumber,
    group_code: null,
    home_team_id: null,
    away_team_id: null,
    home_goals: null,
    away_goals: null,
    winner_team_id: null
  }));
  return [...groupRows, ...knockoutRows];
}

test("buildResolveKnockoutSlotsPlan maps DB rows into the engine's shape and resolves available slots", () => {
  const plan = buildResolveKnockoutSlotsPlan({ teamRows: buildTeamRows(), fixtureRows: buildFixtureRows() });

  assert.equal(plan.length, 16);
  assert.deepEqual(plan.find((entry) => entry.matchNumber === 73), {
    id: "M-73",
    matchNumber: 73,
    homeTeamId: "KOR",
    awayTeamId: "CAN"
  });
});

test("resolveKnockoutSlots in dry-run mode returns the plan without writing anything", async () => {
  const writer = {
    applyResolveKnockoutSlotsPlan: async () => {
      throw new Error("must not write in dry-run mode");
    }
  };

  const result = await resolveKnockoutSlots({
    teamRows: buildTeamRows(),
    fixtureRows: buildFixtureRows(),
    writer,
    apply: false
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.resolvedCount, 16);
});

test("resolveKnockoutSlots in apply mode writes each resolved entry and records a completed run", async () => {
  const applied = [];
  const recorded = [];
  const writer = {
    applyResolveKnockoutSlotsPlan: async (entry) => {
      applied.push(entry);
    },
    recordIngestionRun: async (run) => {
      recorded.push(run);
    }
  };

  const result = await resolveKnockoutSlots({
    teamRows: buildTeamRows(),
    fixtureRows: buildFixtureRows(),
    writer,
    apply: true
  });

  assert.equal(result.mode, "apply");
  assert.equal(applied.length, 16);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "completed");
  assert.equal(recorded[0].rowsChanged, 16);
});
