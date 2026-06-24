import assert from "node:assert/strict";
import test from "node:test";

import { computeLambda, scorelineProbability } from "../../packages/tournament-engine/src/engine/dixon-coles.js";
import { fitDixonColes } from "./fit-dixon-coles.mjs";

function createSeededRandom(seedText) {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    state = Math.imul(state ^ seedText.charCodeAt(index), 16777619);
  }
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleScoreline(lambdaHome, lambdaAway, rho, random) {
  const maxGoals = 8;
  const grid = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x += 1) {
    for (let y = 0; y <= maxGoals; y += 1) {
      const probability = scorelineProbability(x, y, lambdaHome, lambdaAway, rho);
      total += probability;
      grid.push({ x, y, probability });
    }
  }
  let pick = random() * total;
  for (const cell of grid) {
    pick -= cell.probability;
    if (pick <= 0) return cell;
  }
  return grid[grid.length - 1];
}

test("fitDixonColes recovers known attack/defense/homeAdvantage/rho from synthetic data", () => {
  const trueAttack = { A: 0.5, B: 0.2, C: -0.1, D: -0.4 };
  const trueDefense = { A: 0.1, B: -0.1, C: 0.2, D: 0.3 };
  const trueHomeAdvantage = 0.25;
  const trueRho = -0.08;
  const random = createSeededRandom("dixon-coles-recovery-check");

  const teamIds = Object.keys(trueAttack);
  const matches = [];
  let dayOffset = 0;

  for (let round = 0; round < 150; round += 1) {
    for (const home of teamIds) {
      for (const away of teamIds) {
        if (home === away) continue;
        const isNeutralVenue = round % 2 === 0;
        const lambdaHome = computeLambda(trueAttack[home], trueDefense[away], {
          homeAdvantage: trueHomeAdvantage,
          applyHomeAdvantage: !isNeutralVenue
        });
        const lambdaAway = computeLambda(trueAttack[away], trueDefense[home], { applyHomeAdvantage: false });
        const { x, y } = sampleScoreline(lambdaHome, lambdaAway, trueRho, random);
        matches.push({
          date: new Date(2020, 0, 1 + dayOffset),
          homeTeamId: home,
          awayTeamId: away,
          homeGoals: x,
          awayGoals: y,
          isNeutralVenue
        });
        dayOffset += 1;
      }
    }
  }

  const referenceDate = matches[matches.length - 1].date;
  const fit = fitDixonColes(matches, teamIds, {
    iterations: 400,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.001,
    referenceDate
  });

  for (const team of teamIds) {
    assert.ok(
      Math.abs(fit.attack.get(team) - trueAttack[team]) < 0.15,
      `attack[${team}]: expected close to ${trueAttack[team]}, got ${fit.attack.get(team)}`
    );
    assert.ok(
      Math.abs(fit.defense.get(team) - trueDefense[team]) < 0.15,
      `defense[${team}]: expected close to ${trueDefense[team]}, got ${fit.defense.get(team)}`
    );
  }
  assert.ok(Math.abs(fit.homeAdvantage - trueHomeAdvantage) < 0.15);
  assert.ok(Math.abs(fit.rho - trueRho) < 0.15);
});

test("fitDixonColes weights recent matches more than old ones", () => {
  const teamIds = ["A", "B"];
  const referenceDate = new Date(2026, 0, 1);
  const oldMatch = { date: new Date(2000, 0, 1), homeTeamId: "A", awayTeamId: "B", homeGoals: 5, awayGoals: 0, isNeutralVenue: true };
  const recentMatch = { date: new Date(2025, 11, 1), homeTeamId: "A", awayTeamId: "B", homeGoals: 0, awayGoals: 5, isNeutralVenue: true };

  const recentHeavy = fitDixonColes([oldMatch, recentMatch, recentMatch, recentMatch], teamIds, {
    iterations: 200,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.001,
    referenceDate
  });

  assert.ok(
    recentHeavy.attack.get("B") > recentHeavy.attack.get("A"),
    "three heavily-weighted recent B-dominant matches should outweigh one old A-dominant match"
  );
});
