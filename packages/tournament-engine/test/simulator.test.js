import assert from "node:assert/strict";
import test from "node:test";

import { pickMode, runMonteCarlo } from "../src/engine/simulator.js";

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
