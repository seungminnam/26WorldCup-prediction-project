import assert from "node:assert/strict";
import test from "node:test";

import { fixtures, teams } from "../src/data/index.js";
import { pickMode, runMonteCarlo, summarizeGroupOutcome } from "../src/engine/simulator.js";

test("pickMode returns the value with the highest count", () => {
  const histogram = new Map([
    [3, 5],
    [4, 9],
    [6, 2]
  ]);

  assert.equal(pickMode(histogram, 4.4), 4);
});

test("pickMode breaks a count tie by distance to the tiebreak target", () => {
  const histogram = new Map([
    [3, 5],
    [6, 5]
  ]);

  assert.equal(pickMode(histogram, 4.2), 3);
  assert.equal(pickMode(histogram, 4.9), 6);
});

test("pickMode breaks a fully tied count-and-distance case by the smaller value", () => {
  const histogram = new Map([
    [3, 5],
    [5, 5]
  ]);

  assert.equal(pickMode(histogram, 4), 3);
});

test("runMonteCarlo's groupProjections sort by mode points, then mode goal difference, then average goals for", () => {
  const result = runMonteCarlo({ simulations: 30, seed: "projection-sort-check" });

  for (const group of new Set(result.groupProjections.map((row) => row.group))) {
    const rows = result.groupProjections.filter((row) => row.group === group);

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      const isOrdered =
        previous.modePoints > current.modePoints ||
        (previous.modePoints === current.modePoints && previous.modeGoalDifference > current.modeGoalDifference) ||
        (previous.modePoints === current.modePoints &&
          previous.modeGoalDifference === current.modeGoalDifference &&
          previous.averageGoalsFor >= current.averageGoalsFor);

      assert.ok(
        isOrdered,
        `expected ${previous.teamId} (mode ${previous.modePoints}/${previous.modeGoalDifference}) to rank ahead of ${current.teamId} (mode ${current.modePoints}/${current.modeGoalDifference}) in group ${group}`
      );
    }
  }
});

test("runMonteCarlo's groupProjections expose mode-based fields instead of expectedRank/average points", () => {
  const result = runMonteCarlo({ simulations: 10, seed: "projection-shape-check" });
  const [row] = result.groupProjections;

  assert.equal(typeof row.modePoints, "number");
  assert.equal(typeof row.modeGoalDifference, "number");
  assert.equal(typeof row.averageGoalsFor, "number");
  assert.equal("expectedRank" in row, false);
  assert.equal("averagePoints" in row, false);
  assert.equal("averageGoalDifference" in row, false);
  assert.ok(row.modePoints >= 0 && row.modePoints <= 9);
});

test("summarizeGroupOutcome picks the single most frequent joint outcome and keeps every team's stats drawn from it", () => {
  const groupOutcomes = new Map([
    [
      "CAN:4,SUI:7",
      {
        count: 6,
        pointsByTeam: new Map([
          ["CAN", 4],
          ["SUI", 7]
        ]),
        perTeam: new Map([
          ["CAN", { gdHistogram: new Map([[5, 4], [6, 2]]), goalsForSum: 45, goalsForCount: 6 }],
          ["SUI", { gdHistogram: new Map([[4, 4], [3, 2]]), goalsForSum: 50, goalsForCount: 6 }]
        ])
      }
    ],
    [
      "CAN:5,SUI:5",
      {
        count: 4,
        pointsByTeam: new Map([
          ["CAN", 5],
          ["SUI", 5]
        ]),
        perTeam: new Map([
          ["CAN", { gdHistogram: new Map([[6, 4]]), goalsForSum: 28, goalsForCount: 4 }],
          ["SUI", { gdHistogram: new Map([[3, 4]]), goalsForSum: 22, goalsForCount: 4 }]
        ])
      }
    ]
  ]);

  const summaries = summarizeGroupOutcome(groupOutcomes, ["CAN", "SUI"]);

  assert.equal(summaries.get("CAN").modePoints, 4);
  assert.equal(summaries.get("SUI").modePoints, 7);
  assert.equal(summaries.get("CAN").modeGoalDifference, 5);
  assert.equal(summaries.get("SUI").modeGoalDifference, 4);
  assert.equal(summaries.get("CAN").averageGoalsFor, 7.5);
});

test("summarizeGroupOutcome breaks a count tie between outcomes lexicographically by key", () => {
  const groupOutcomes = new Map([
    [
      "CAN:4,SUI:4",
      {
        count: 5,
        pointsByTeam: new Map([
          ["CAN", 4],
          ["SUI", 4]
        ]),
        perTeam: new Map([
          ["CAN", { gdHistogram: new Map([[0, 5]]), goalsForSum: 25, goalsForCount: 5 }],
          ["SUI", { gdHistogram: new Map([[0, 5]]), goalsForSum: 25, goalsForCount: 5 }]
        ])
      }
    ],
    [
      "CAN:6,SUI:2",
      {
        count: 5,
        pointsByTeam: new Map([
          ["CAN", 6],
          ["SUI", 2]
        ]),
        perTeam: new Map([
          ["CAN", { gdHistogram: new Map([[3, 5]]), goalsForSum: 30, goalsForCount: 5 }],
          ["SUI", { gdHistogram: new Map([[-3, 5]]), goalsForSum: 10, goalsForCount: 5 }]
        ])
      }
    ]
  ]);

  const summaries = summarizeGroupOutcome(groupOutcomes, ["CAN", "SUI"]);

  assert.equal(summaries.get("CAN").modePoints, 4);
});

test("runMonteCarlo keeps two rivals' projected goal difference zero-sum consistent when only their head-to-head match remains", () => {
  const groupBFixtures = fixtures.filter((fixture) => fixture.group === "B").map((fixture) => ({ ...fixture }));

  function setScoreBetween(list, teamA, teamB, goalsA, goalsB) {
    const forward = list.find((fixture) => fixture.homeTeamId === teamA && fixture.awayTeamId === teamB);
    if (forward) {
      forward.homeGoals = goalsA;
      forward.awayGoals = goalsB;
      return;
    }
    const reverse = list.find((fixture) => fixture.homeTeamId === teamB && fixture.awayTeamId === teamA);
    if (!reverse) throw new Error(`fixture not found: ${teamA} vs ${teamB}`);
    reverse.homeGoals = goalsB;
    reverse.awayGoals = goalsA;
  }

  setScoreBetween(groupBFixtures, "CAN", "BIH", 0, 0);
  setScoreBetween(groupBFixtures, "SUI", "BIH", 5, 2);
  setScoreBetween(groupBFixtures, "CAN", "QAT", 7, 1);
  setScoreBetween(groupBFixtures, "SUI", "QAT", 0, 0);

  const fixtureList = [...fixtures.filter((fixture) => fixture.group !== "B"), ...groupBFixtures];
  const result = runMonteCarlo({ simulations: 1500, teamList: teams, fixtureList, seed: "group-b-consistency-check" });
  const byTeamId = new Map(result.groupProjections.filter((row) => row.group === "B").map((row) => [row.teamId, row]));

  const canada = byTeamId.get("CAN");
  const switzerland = byTeamId.get("SUI");

  const canadaPointsChange = canada.modePoints - 4;
  const switzerlandPointsChange = switzerland.modePoints - 4;
  const canadaGdChange = canada.modeGoalDifference - 6;
  const switzerlandGdChange = switzerland.modeGoalDifference - 3;

  assert.ok(
    (canadaPointsChange === 3 && switzerlandPointsChange === 0) ||
      (canadaPointsChange === 0 && switzerlandPointsChange === 3) ||
      (canadaPointsChange === 1 && switzerlandPointsChange === 1),
    `expected a zero-sum win/loss or mutual draw, got Canada +${canadaPointsChange} / Switzerland +${switzerlandPointsChange}`
  );
  assert.equal(
    canadaGdChange,
    -switzerlandGdChange,
    `expected Canada's and Switzerland's projected goal-difference change to be equal and opposite, got ${canadaGdChange} and ${switzerlandGdChange}`
  );
});
