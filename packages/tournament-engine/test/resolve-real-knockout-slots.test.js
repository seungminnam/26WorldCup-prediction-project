import assert from "node:assert/strict";
import test from "node:test";

import { resolveRealKnockoutSlots } from "../src/engine/bracket.js";
import { knockoutFixtures } from "../src/data/canonical-schedule.js";
import { teams } from "../src/data/teams.js";
import { fixtures as groupFixtures } from "../src/data/fixtures.js";

function buildGroupMatches(groupsToComplete) {
  return groupFixtures.map((fixture) => {
    if (!groupsToComplete.has(fixture.group)) {
      return { ...fixture, homeGoals: undefined, awayGoals: undefined };
    }
    const teamsInGroup = teams.filter((team) => team.group === fixture.group).sort((a, b) => a.id.localeCompare(b.id));
    const homeIndex = teamsInGroup.findIndex((team) => team.id === fixture.homeTeamId);
    const awayIndex = teamsInGroup.findIndex((team) => team.id === fixture.awayTeamId);
    return homeIndex < awayIndex
      ? { ...fixture, homeGoals: 2, awayGoals: 0 }
      : { ...fixture, homeGoals: 0, awayGoals: 2 };
  });
}

// Merges newly-resolved team identities into a knockout-match input list, carrying forward
// anything already known from `previousInput`. Never sets winnerTeamId on its own -- a
// resolved match's TEAMS being known is independent of that match having been PLAYED yet.
function mergeResolvedTeams(resolvedByNumber, previousInput = []) {
  const previousByNumber = new Map(previousInput.map((match) => [match.matchNumber, match]));
  return knockoutFixtures.map((fixture) => {
    const resolved = resolvedByNumber.get(fixture.matchNumber);
    const previous = previousByNumber.get(fixture.matchNumber);
    if (resolved) {
      return {
        matchNumber: fixture.matchNumber,
        group: null,
        homeTeamId: resolved.homeTeamId,
        awayTeamId: resolved.awayTeamId,
        winnerTeamId: previous?.winnerTeamId ?? null
      };
    }
    return (
      previous ?? {
        matchNumber: fixture.matchNumber,
        group: null,
        homeTeamId: null,
        awayTeamId: null,
        winnerTeamId: null
      }
    );
  });
}

// Simulates "these specific already-resolved matches were played, home team won" --
// used only by tests that need a real winner for W##/L## cascade resolution.
function markHomeTeamAsWinner(knockoutInput, matchNumbers) {
  const targets = new Set(matchNumbers);
  return knockoutInput.map((match) =>
    targets.has(match.matchNumber) ? { ...match, winnerTeamId: match.homeTeamId } : match
  );
}

const groups = [...new Set(teams.map((team) => team.group))].sort();

test("resolves 1st/2nd place slots incrementally as individual groups finish, before all groups are done", () => {
  const completedGroups = new Set(groups.slice(0, 9));
  const matches = buildGroupMatches(completedGroups);

  const resolved = resolveRealKnockoutSlots(teams, matches);

  assert.equal(resolved.size, 5);
  assert.deepEqual(resolved.get(73), { homeTeamId: "KOR", awayTeamId: "CAN" });
});

test("resolves the remaining Round-of-32 slots once all 12 groups finish, without re-resolving already-resolved matches", () => {
  const completedGroups = new Set(groups.slice(0, 9));
  const matches1 = buildGroupMatches(completedGroups);
  const resolved1 = resolveRealKnockoutSlots(teams, matches1);
  const knockoutInput1 = mergeResolvedTeams(resolved1);

  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolved2 = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInput1]);

  assert.equal(resolved2.size, 11);
  assert.ok(!resolved2.has(73), "M73 was already resolved in the first pass and must not be re-emitted");
});

test("cascades W##/L## references for Round of 16 once Round-of-32 matches have real winners", () => {
  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolvedR32 = resolveRealKnockoutSlots(teams, allGroupMatches);
  const knockoutInput = markHomeTeamAsWinner(mergeResolvedTeams(resolvedR32), resolvedR32.keys());

  const resolvedR16 = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInput]);

  assert.equal(resolvedR16.size, 8);
  assert.deepEqual(resolvedR16.get(90), { homeTeamId: "KOR", awayTeamId: "JPN" });
});

test("never re-emits a knockout match that already has real team IDs", () => {
  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolvedR32 = resolveRealKnockoutSlots(teams, allGroupMatches);
  const knockoutInputAfterR32 = markHomeTeamAsWinner(mergeResolvedTeams(resolvedR32), resolvedR32.keys());

  const firstPass = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInputAfterR32]);
  const secondPassInput = mergeResolvedTeams(firstPass, knockoutInputAfterR32);
  const secondPass = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...secondPassInput]);

  for (const matchNumber of firstPass.keys()) {
    assert.ok(!secondPass.has(matchNumber), `M${matchNumber} was already resolved and must not be re-emitted`);
  }
});
