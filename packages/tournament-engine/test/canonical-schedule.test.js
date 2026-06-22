import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSchedule, groupFixtures, knockoutFixtures } from "../src/data/canonical-schedule.js";

test("contains the complete official 104-match schedule", () => {
  assert.equal(canonicalSchedule.length, 104);
  assert.equal(new Set(canonicalSchedule.map((fixture) => fixture.matchNumber)).size, 104);
  assert.deepEqual(
    canonicalSchedule.map((fixture) => fixture.matchNumber).sort((a, b) => a - b),
    Array.from({ length: 104 }, (_, index) => index + 1)
  );
});

test("separates fixed group participants from knockout slots", () => {
  assert.equal(groupFixtures.length, 72);
  assert.equal(knockoutFixtures.length, 32);
  assert.ok(groupFixtures.every((fixture) => fixture.homeTeamId && fixture.awayTeamId));
  assert.ok(knockoutFixtures.every((fixture) => fixture.homeSlot && fixture.awaySlot));
});

test("uses FIFA metadata for Czechia-South Africa and Mexico-Korea Republic", () => {
  assert.deepEqual(pick(canonicalSchedule.find((fixture) => fixture.matchNumber === 25)), {
    homeTeamId: "CZE",
    awayTeamId: "RSA",
    kickoff: "2026-06-18T16:00:00.000Z",
    venue: "Atlanta"
  });
  assert.deepEqual(pick(canonicalSchedule.find((fixture) => fixture.matchNumber === 28)), {
    homeTeamId: "MEX",
    awayTeamId: "KOR",
    kickoff: "2026-06-19T01:00:00.000Z",
    venue: "Guadalajara"
  });
});

test("uses FIFA knockout numbering, winner paths, and host cities", () => {
  const roundOf32Slots = [
    [73, "2A", "2B"],
    [74, "1E", "3 ABCDF"],
    [75, "1F", "2C"],
    [76, "1C", "2F"],
    [77, "1I", "3 CDFGH"],
    [78, "2E", "2I"],
    [79, "1A", "3 CEFHI"],
    [80, "1L", "3 EHIJK"],
    [81, "1D", "3 BEFIJ"],
    [82, "1G", "3 AEHIJ"],
    [83, "2K", "2L"],
    [84, "1H", "2J"],
    [85, "1B", "3 EFGIJ"],
    [86, "1J", "2H"],
    [87, "1K", "3 DEIJL"],
    [88, "2D", "2G"]
  ];
  const expected = [
    [89, "W74", "W77", "Philadelphia"],
    [90, "W73", "W75", "Houston"],
    [91, "W76", "W78", "New York/New Jersey"],
    [92, "W79", "W80", "Mexico City"],
    [93, "W83", "W84", "Dallas"],
    [94, "W81", "W82", "Seattle"],
    [95, "W86", "W88", "Atlanta"],
    [96, "W85", "W87", "Vancouver"],
    [97, "W89", "W90", "Boston"],
    [98, "W93", "W94", "Los Angeles"],
    [99, "W91", "W92", "Miami"],
    [100, "W95", "W96", "Kansas City"],
    [101, "W97", "W98", "Dallas"],
    [102, "W99", "W100", "Atlanta"],
    [103, "L101", "L102", "Miami"],
    [104, "W101", "W102", "New York/New Jersey"]
  ];

  assert.deepEqual(
    canonicalSchedule
      .filter((fixture) => fixture.matchNumber >= 73 && fixture.matchNumber <= 88)
      .map((fixture) => [fixture.matchNumber, fixture.homeSlot, fixture.awaySlot]),
    roundOf32Slots
  );
  assert.deepEqual(
    canonicalSchedule
      .filter((fixture) => fixture.matchNumber >= 89)
      .map((fixture) => [fixture.matchNumber, fixture.homeSlot, fixture.awaySlot, fixture.venue]),
    expected
  );
});

function pick(fixture) {
  return {
    homeTeamId: fixture?.homeTeamId,
    awayTeamId: fixture?.awayTeamId,
    kickoff: fixture?.kickoff,
    venue: fixture?.venue
  };
}
