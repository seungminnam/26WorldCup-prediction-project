import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupTable, compareGroupStageRows, rankGroup } from "../src/engine/ranking.js";

const teams = [
  { id: "alpha", name: "Alpha", group: "A", rating: 1820 },
  { id: "bravo", name: "Bravo", group: "A", rating: 1710 },
  { id: "charlie", name: "Charlie", group: "A", rating: 1640 },
  { id: "delta", name: "Delta", group: "A", rating: 1510 }
];

test("buildGroupTable calculates points, goals, goal difference, and a zero conduct score with no cards", () => {
  const matches = [
    { group: "A", homeTeamId: "alpha", awayTeamId: "bravo", homeGoals: 2, awayGoals: 0 },
    { group: "A", homeTeamId: "charlie", awayTeamId: "delta", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "alpha", awayTeamId: "charlie", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "bravo", awayTeamId: "delta", homeGoals: 3, awayGoals: 2 },
    { group: "A", homeTeamId: "delta", awayTeamId: "alpha", homeGoals: 0, awayGoals: 2 },
    { group: "A", homeTeamId: "bravo", awayTeamId: "charlie", homeGoals: 0, awayGoals: 0 }
  ];

  const table = buildGroupTable(teams, matches);

  assert.deepEqual(table.find((row) => row.teamId === "alpha"), {
    teamId: "alpha",
    group: "A",
    played: 3,
    wins: 2,
    draws: 1,
    losses: 0,
    goalsFor: 5,
    goalsAgainst: 1,
    goalDifference: 4,
    points: 7,
    conductScore: 0,
    rating: 1820,
    fifaRanking: undefined
  });
});

test("buildGroupTable deducts conduct score for yellow and red cards", () => {
  const matches = [
    {
      group: "A",
      homeTeamId: "alpha",
      awayTeamId: "bravo",
      homeGoals: 1,
      awayGoals: 0,
      cards: [
        { teamId: "alpha", eventType: "yellow_card" },
        { teamId: "bravo", eventType: "red_card" },
        { teamId: "bravo", eventType: "yellow_card" }
      ]
    }
  ];

  const table = buildGroupTable(teams, matches);

  assert.equal(table.find((row) => row.teamId === "alpha").conductScore, -1);
  assert.equal(table.find((row) => row.teamId === "bravo").conductScore, -5);
});

test("rankGroup resolves a two-team tie by head-to-head result", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 0, goalsFor: 3 },
    { teamId: "b", group: "A", points: 4, goalDifference: 0, goalsFor: 3 }
  ];
  const matches = [{ group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 1 }];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b"]);
});

test("rankGroup resolves a three-team tie fully via the head-to-head mini-table", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 1, goalsFor: 3 },
    { teamId: "b", group: "A", points: 4, goalDifference: 1, goalsFor: 3 },
    { teamId: "c", group: "A", points: 4, goalDifference: -2, goalsFor: 1 }
  ];
  const matches = [
    { group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 1 },
    { group: "A", homeTeamId: "b", awayTeamId: "c", homeGoals: 2, awayGoals: 0 },
    { group: "A", homeTeamId: "c", awayTeamId: "a", homeGoals: 1, awayGoals: 3 }
  ];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b", "c"]);
});

test("rankGroup falls through to all-matches goal difference when the mini-table stays tied", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 3, goalsFor: 6 },
    { teamId: "b", group: "A", points: 4, goalDifference: 1, goalsFor: 4 },
    { teamId: "c", group: "A", points: 4, goalDifference: -1, goalsFor: 3 }
  ];
  const matches = [
    { group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "a", awayTeamId: "c", homeGoals: 1, awayGoals: 1 }
  ];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b", "c"]);
});

test("compareGroupStageRows breaks a points/goal-difference/goals-for tie by conduct score, then FIFA ranking", () => {
  const betterConduct = { teamId: "a", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 10 };
  const worseConduct = { teamId: "b", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -3, fifaRanking: 5 };
  assert.ok(compareGroupStageRows(betterConduct, worseConduct) < 0);

  const worseRanking = { teamId: "c", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -2, fifaRanking: 20 };
  const betterRanking = { teamId: "d", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -2, fifaRanking: 8 };
  assert.ok(compareGroupStageRows(worseRanking, betterRanking) > 0);
});

test("compareGroupStageRows treats missing conduct score and ranking as neutral, falling back to team id", () => {
  const a = { teamId: "a", points: 4, goalDifference: 0, goalsFor: 2 };
  const b = { teamId: "b", points: 4, goalDifference: 0, goalsFor: 2 };
  assert.ok(compareGroupStageRows(a, b) < 0);
});
