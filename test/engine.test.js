import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupTable, rankGroup } from "../src/engine/ranking.js";
import { selectBestThirdPlaceTeams } from "../src/engine/thirdPlace.js";
import { buildRoundOf32, simulateKnockout } from "../src/engine/bracket.js";
import { runMonteCarlo } from "../src/engine/simulator.js";

const teams = [
  { id: "alpha", name: "Alpha", group: "A", rating: 1820 },
  { id: "bravo", name: "Bravo", group: "A", rating: 1710 },
  { id: "charlie", name: "Charlie", group: "A", rating: 1640 },
  { id: "delta", name: "Delta", group: "A", rating: 1510 }
];

test("buildGroupTable calculates points, goals, and goal difference", () => {
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
    rating: 1820
  });
});

test("rankGroup sorts by points, goal difference, goals for, then rating", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 2, goalsFor: 4, rating: 1600 },
    { teamId: "b", group: "A", points: 6, goalDifference: 1, goalsFor: 3, rating: 1500 },
    { teamId: "c", group: "A", points: 4, goalDifference: 2, goalsFor: 5, rating: 1400 },
    { teamId: "d", group: "A", points: 4, goalDifference: 2, goalsFor: 5, rating: 1700 }
  ];

  assert.deepEqual(rankGroup(rows).map((row) => row.teamId), ["b", "d", "c", "a"]);
});

test("selectBestThirdPlaceTeams picks the top eight third-place rows", () => {
  const groupRankings = Array.from({ length: 12 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return [
      { teamId: `${group}1`, group, points: 9, goalDifference: 5, goalsFor: 7, rating: 1800 },
      { teamId: `${group}2`, group, points: 6, goalDifference: 2, goalsFor: 5, rating: 1700 },
      { teamId: `${group}3`, group, points: index, goalDifference: index - 5, goalsFor: index + 1, rating: 1500 + index },
      { teamId: `${group}4`, group, points: 0, goalDifference: -6, goalsFor: 1, rating: 1300 }
    ];
  });

  const bestThirds = selectBestThirdPlaceTeams(groupRankings);

  assert.equal(bestThirds.length, 8);
  assert.deepEqual(bestThirds.map((row) => row.group), ["L", "K", "J", "I", "H", "G", "F", "E"]);
});

test("buildRoundOf32 creates sixteen matches from group rankings and best thirds", () => {
  const groupRankings = Array.from({ length: 12 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return [
      { teamId: `${group}1`, group, points: 9, goalDifference: 5, goalsFor: 7, rating: 1800 },
      { teamId: `${group}2`, group, points: 6, goalDifference: 2, goalsFor: 5, rating: 1700 },
      { teamId: `${group}3`, group, points: 4, goalDifference: 0, goalsFor: 4, rating: 1600 },
      { teamId: `${group}4`, group, points: 0, goalDifference: -6, goalsFor: 1, rating: 1300 }
    ];
  });

  const matches = buildRoundOf32(groupRankings, selectBestThirdPlaceTeams(groupRankings));

  assert.equal(matches.length, 16);
  assert.equal(matches[0].round, "Round of 32");
  assert.deepEqual(matches[0].teamIds, ["A2", "B2"]);
  assert.deepEqual(matches.at(-1).teamIds, ["L1", "H3"]);
});

test("buildRoundOf32 uses each qualified team once", () => {
  const groupRankings = Array.from({ length: 12 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return [
      { teamId: `${group}1`, group, points: 9, goalDifference: 5, goalsFor: 7, rating: 1800 },
      { teamId: `${group}2`, group, points: 6, goalDifference: 2, goalsFor: 5, rating: 1700 },
      { teamId: `${group}3`, group, points: 4, goalDifference: 0, goalsFor: 4, rating: 1600 + index },
      { teamId: `${group}4`, group, points: 0, goalDifference: -6, goalsFor: 1, rating: 1300 }
    ];
  });

  const matches = buildRoundOf32(groupRankings, selectBestThirdPlaceTeams(groupRankings));
  const teamIds = matches.flatMap((match) => match.teamIds);

  assert.equal(teamIds.length, 32);
  assert.equal(new Set(teamIds).size, 32);
});

test("simulateKnockout advances one champion through five rounds", () => {
  const teamsById = Object.fromEntries(
    Array.from({ length: 32 }, (_, index) => {
      const id = `T${index + 1}`;
      return [id, { id, name: id, rating: 2000 - index }];
    })
  );
  const roundOf32 = Array.from({ length: 16 }, (_, index) => ({
    id: 73 + index,
    round: "Round of 32",
    teamIds: [`T${index * 2 + 1}`, `T${index * 2 + 2}`]
  }));

  const result = simulateKnockout(roundOf32, teamsById, () => 0);

  assert.equal(result.championId, "T1");
  assert.equal(result.rounds["Final"].length, 1);
  assert.equal(result.teamFinishes.T1, "Champion");
  assert.equal(result.teamFinishes.T2, "Round of 32");
  assert.deepEqual(result.rounds["Round of 32"][0].score, { T1: 0, T2: 0 });
});

test("runMonteCarlo aggregates advancement probabilities", () => {
  const result = runMonteCarlo({ simulations: 20, random: () => 0.42 });

  assert.equal(result.teams.length, 48);
  assert.equal(result.probabilities.length, 48);
  assert.equal(result.groupProjections.length, 48);
  assert.equal(result.sampleBracket.rounds["Round of 32"].length, 16);
  assert.ok(result.probabilities.every((row) => row.roundOf32 >= 0 && row.roundOf32 <= 1));
  assert.ok(result.groupProjections.every((row) => row.rankProbabilities.length === 4));
  assert.ok(result.groupProjections.every((row) => row.roundOf32 >= 0 && row.roundOf32 <= 1));
  assert.equal(
    result.probabilities.reduce((sum, row) => sum + row.champion, 0),
    1
  );
});

test("runMonteCarlo produces repeatable forecasts for the same seed", () => {
  const first = runMonteCarlo({ simulations: 20, seed: "snapshot:group-stage:current" });
  const second = runMonteCarlo({ simulations: 20, seed: "snapshot:group-stage:current" });

  assert.deepEqual(second, first);
});
