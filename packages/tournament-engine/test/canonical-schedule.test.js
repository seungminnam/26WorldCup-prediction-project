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

function pick(fixture) {
  return {
    homeTeamId: fixture?.homeTeamId,
    awayTeamId: fixture?.awayTeamId,
    kickoff: fixture?.kickoff,
    venue: fixture?.venue
  };
}
