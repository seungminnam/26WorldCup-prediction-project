import assert from "node:assert/strict";
import test from "node:test";
import { readableSlotLabel, deriveKnockoutWinner, buildActualBracketMatches } from "../lib/bracket-data.ts";

test("readableSlotLabel renders group-finish slots", () => {
  assert.equal(readableSlotLabel("1A"), "1st · Grp A");
  assert.equal(readableSlotLabel("2L"), "2nd · Grp L");
  assert.equal(readableSlotLabel("3 ABCDF"), "3rd best · A B C D F");
});

test("readableSlotLabel renders bracket-reference slots", () => {
  assert.equal(readableSlotLabel("W73"), "Winner M73");
  assert.equal(readableSlotLabel("L84"), "Loser M84");
});

test("deriveKnockoutWinner returns null when match is not finished", () => {
  const fixture = { homeTeamId: "RSA", awayTeamId: "CAN", homeGoals: undefined, awayGoals: undefined, homePenalties: undefined, awayPenalties: undefined };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: null, loserId: null });
});

test("deriveKnockoutWinner derives winner from regular-time goals", () => {
  const fixture = { homeTeamId: "RSA", awayTeamId: "CAN", homeGoals: 0, awayGoals: 1, homePenalties: undefined, awayPenalties: undefined };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: "CAN", loserId: "RSA" });
});

test("deriveKnockoutWinner derives winner from penalties when regular time draws", () => {
  const fixture = { homeTeamId: "BRA", awayTeamId: "JPN", homeGoals: 1, awayGoals: 1, homePenalties: 4, awayPenalties: 3 };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: "BRA", loserId: "JPN" });
});

test("buildActualBracketMatches emits FT match with winnerId from goals", () => {
  // Minimal synthetic fixtures: one FT knockout match (M73) + enough to satisfy slot resolution
  const fixtures = [
    { matchNumber: 73, stage: "round_of_32", homeTeamId: "RSA", awayTeamId: "CAN", homeSlot: "2A", awaySlot: "2B", homeGoals: 0, awayGoals: 1, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Los Angeles" },
    // All other knockout fixtures with null teams (status: Upcoming)
    { matchNumber: 74, stage: "round_of_32", homeTeamId: "GER", awayTeamId: null, homeSlot: "1E", awaySlot: "3 ABCDF", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-01T00:00:00Z", venue: "Boston" }
  ];
  const teams = [
    { id: "RSA", name: "South Africa" },
    { id: "CAN", name: "Canada" },
    { id: "GER", name: "Germany" }
  ];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const r32 = rounds["Round of 32"] ?? [];

  const m73 = r32.find((m) => m.matchNumber === 73);
  assert.ok(m73, "M73 should appear in Round of 32");
  assert.equal(m73.homeTeamId, "RSA");
  assert.equal(m73.awayTeamId, "CAN");
  assert.equal(m73.winnerTeamId, "CAN");
  assert.equal(m73.homeGoals, 0);
  assert.equal(m73.awayGoals, 1);
  assert.equal(m73.wentToPenalties, false);
});

test("buildActualBracketMatches emits half-resolved match with readable slot for unknown side", () => {
  const fixtures = [
    { matchNumber: 74, stage: "round_of_32", homeTeamId: "GER", awayTeamId: null, homeSlot: "1E", awaySlot: "3 ABCDF", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-01T00:00:00Z", venue: "Boston" }
  ];
  const teams = [{ id: "GER", name: "Germany" }];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const m74 = (rounds["Round of 32"] ?? []).find((m) => m.matchNumber === 74);
  assert.ok(m74);
  assert.equal(m74.homeTeamId, "GER");
  assert.equal(m74.awayTeamId, null);
  assert.equal(m74.awayDisplay, "3rd best · A B C D F");
  assert.equal(m74.winnerTeamId, null);
});

test("buildActualBracketMatches derives awayTeamId from W## reference when upstream match is finished", () => {
  const fixtures = [
    { matchNumber: 73, stage: "round_of_32", homeTeamId: "RSA", awayTeamId: "CAN", homeSlot: "2A", awaySlot: "2B", homeGoals: 0, awayGoals: 1, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Los Angeles" },
    { matchNumber: 75, stage: "round_of_32", homeTeamId: "NED", awayTeamId: "MAR", homeSlot: "1F", awaySlot: "2C", homeGoals: 2, awayGoals: 0, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Monterrey" },
    { matchNumber: 90, stage: "round_of_16", homeTeamId: null, awayTeamId: null, homeSlot: "W73", awaySlot: "W75", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-02T00:00:00Z", venue: "Houston" }
  ];
  const teams = [
    { id: "RSA", name: "South Africa" }, { id: "CAN", name: "Canada" }, { id: "NED", name: "Netherlands" }, { id: "MAR", name: "Morocco" }
  ];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const m90 = (rounds["Round of 16"] ?? []).find((m) => m.matchNumber === 90);
  assert.ok(m90);
  assert.equal(m90.homeTeamId, "CAN");
  assert.equal(m90.awayTeamId, "NED");
});
