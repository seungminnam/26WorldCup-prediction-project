import assert from "node:assert/strict";
import test from "node:test";

import { knockoutFixtures } from "../src/data/canonical-schedule.js";
import { thirdPlaceAssignments } from "../src/data/third-place-assignments.js";
import { buildRoundOf32, simulateKnockout } from "../src/engine/bracket.js";

const groups = "ABCDEFGHIJKL".split("");
const groupRankings = groups.map((group) =>
  [1, 2, 3, 4].map((rank) => ({
    group,
    teamId: `${group}${rank}`,
    played: 3,
    points: 10 - rank,
    goalDifference: 4 - rank,
    goalsFor: 5 - rank
  }))
);

const optionOneThirds = ["E", "F", "G", "H", "I", "J", "K", "L"].map((group) => ({
  group,
  teamId: `${group}3`
}));

const expectedRoundOf32Slots = [
  [73, "2A", "2B"],
  [74, "1E", "3F"],
  [75, "1F", "2C"],
  [76, "1C", "2F"],
  [77, "1I", "3G"],
  [78, "2E", "2I"],
  [79, "1A", "3E"],
  [80, "1L", "3K"],
  [81, "1D", "3I"],
  [82, "1G", "3H"],
  [83, "2K", "2L"],
  [84, "1H", "2J"],
  [85, "1B", "3J"],
  [86, "1J", "2H"],
  [87, "1K", "3L"],
  [88, "2D", "2G"]
];

const expectedDependencies = [
  [89, "W74", "W77"],
  [90, "W73", "W75"],
  [91, "W76", "W78"],
  [92, "W79", "W80"],
  [93, "W83", "W84"],
  [94, "W81", "W82"],
  [95, "W86", "W88"],
  [96, "W85", "W87"],
  [97, "W89", "W90"],
  [98, "W93", "W94"],
  [99, "W91", "W92"],
  [100, "W95", "W96"],
  [101, "W97", "W98"],
  [102, "W99", "W100"],
  [103, "L101", "L102"],
  [104, "W101", "W102"]
];

test("resolves the complete round of 32 from the official FIFA slots", () => {
  const matches = buildRoundOf32(groupRankings, optionOneThirds);

  assert.deepEqual(
    matches.map((match) => [match.id, ...match.slots]),
    expectedRoundOf32Slots
  );
  assert.deepEqual(matches.find((match) => match.id === 75), {
    id: 75,
    round: "Round of 32",
    stage: "round_of_32",
    slots: ["1F", "2C"],
    teamIds: ["F1", "C2"],
    kickoff: "2026-06-30T01:00:00.000Z",
    venue: "Monterrey",
    stadium: "Estadio BBVA"
  });
});

test("contains every official Annex C combination exactly once", () => {
  const entries = Object.entries(thirdPlaceAssignments);
  const eligibleGroups = {
    "1A": "CEFHI",
    "1B": "EFGIJ",
    "1D": "BEFIJ",
    "1E": "ABCDF",
    "1G": "AEHIJ",
    "1I": "CDFGH",
    "1K": "DEIJL",
    "1L": "EHIJK"
  };

  assert.equal(entries.length, 495);

  for (const [qualifiedGroups, assignments] of entries) {
    assert.equal(qualifiedGroups.length, 8);
    assert.deepEqual(
      Object.values(assignments).map((slot) => slot.slice(1)).sort(),
      qualifiedGroups.split("").sort()
    );

    for (const [winnerSlot, thirdSlot] of Object.entries(assignments)) {
      assert.ok(eligibleGroups[winnerSlot].includes(thirdSlot.slice(1)));
    }
  }
});

test("simulates every later round through the official winner and loser references", () => {
  const roundOf32 = buildRoundOf32(groupRankings, optionOneThirds);
  const teamsById = Object.fromEntries(
    groupRankings.flat().map(({ teamId }) => [teamId, { id: teamId, rating: 1600 }])
  );
  const result = simulateKnockout(roundOf32, teamsById, () => 0.5);
  const matchesById = new Map(
    Object.values(result.rounds).flat().map((match) => [match.id, match])
  );

  assert.deepEqual(
    expectedDependencies,
    knockoutFixtures.slice(16).map((fixture) => [fixture.matchNumber, fixture.homeSlot, fixture.awaySlot])
  );

  for (const [matchNumber, homeReference, awayReference] of expectedDependencies) {
    const match = matchesById.get(matchNumber);
    const resolve = (reference) => {
      const source = matchesById.get(Number(reference.slice(1)));
      return reference.startsWith("W") ? source.winnerId : source.loserId;
    };

    assert.deepEqual(match.teamIds, [resolve(homeReference), resolve(awayReference)]);
  }

  assert.deepEqual(
    Object.fromEntries(Object.entries(result.rounds).map(([round, matches]) => [round, matches.map(({ id }) => id)])),
    {
      "Round of 32": [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
      "Round of 16": [89, 90, 93, 94, 91, 92, 95, 96],
      Quarterfinal: [97, 98, 99, 100],
      Semifinal: [101, 102],
      "Third place": [103],
      Final: [104]
    }
  );
});
