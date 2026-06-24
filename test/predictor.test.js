import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedGoals,
  isHostNationFixture,
  predictMatch,
  winProbability
} from "../packages/tournament-engine/src/engine/predictor.js";

const strength = {
  TEST_HOME: { attack: 0.4, defense: 0.1 },
  TEST_AWAY: { attack: 0.2, defense: 0.3 },
  TEST_STRONG: { attack: 0.9, defense: -0.4 },
  TEST_WEAK: { attack: -0.5, defense: 0.6 },
  TEST_EVEN_A: { attack: 0.3, defense: 0.2 },
  TEST_EVEN_B: { attack: 0.3, defense: 0.2 }
};
const advantage = 0.3;
const rho = -0.05;
const evenHome = { id: "TEST_HOME" };
const evenAway = { id: "TEST_AWAY" };

test("expectedGoals applies home advantage only when explicitly requested, using injected team strength", () => {
  const home = { id: "TEST_HOME" };
  const away = { id: "TEST_AWAY" };

  const withoutAdvantage = expectedGoals(home, away, { strength, advantage, applyHomeAdvantage: false });
  const withAdvantage = expectedGoals(home, away, { strength, advantage, applyHomeAdvantage: true });

  assert.equal(withoutAdvantage, Math.exp(0.4 - 0.3));
  assert.equal(withAdvantage, Math.exp(0.4 - 0.3 + 0.3));
});

test("expectedGoals throws for a team missing from the strength table instead of returning NaN", () => {
  assert.throws(() => expectedGoals({ id: "TEST_HOME" }, { id: "UNKNOWN" }, { strength }), TypeError);
});

test("expectedGoals prefers attack/defense found directly on the team object over the strength table", () => {
  const home = { id: "TEST_HOME", attack: 5 };
  const away = { id: "TEST_AWAY", defense: 5 };

  const lambda = expectedGoals(home, away, { strength, advantage, applyHomeAdvantage: false });

  assert.equal(lambda, Math.exp(5 - 5), "should use the object's own attack/defense (5, 5), not the strength table's (0.4, 0.3)");
});

test("expectedGoals falls back to the strength table when the team object has no attack/defense of its own", () => {
  const home = { id: "TEST_HOME" };
  const away = { id: "TEST_AWAY" };

  const lambda = expectedGoals(home, away, { strength, advantage, applyHomeAdvantage: false });

  assert.equal(lambda, Math.exp(strength.TEST_HOME.attack - strength.TEST_AWAY.defense));
});

test("isHostNationFixture is true only for Mexico, Canada, and the United States", () => {
  assert.equal(isHostNationFixture("MEX"), true);
  assert.equal(isHostNationFixture("CAN"), true);
  assert.equal(isHostNationFixture("USA"), true);
  assert.equal(isHostNationFixture("BRA"), false);
});

test("predictMatch returns a normalized provider-neutral contract", () => {
  const result = predictMatch(evenHome, evenAway, { strength, advantage, rho, isNeutralVenue: true });
  const total = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;

  assert.equal(result.model.id, "dixon-coles-v1");
  assert.equal(result.model.trained, true);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(result.scorelines.length, 3);
  assert.deepEqual(result.mostLikelyScore, result.scorelines[0]);
});

test("equal-strength teams on a neutral venue produce symmetric home and away win probabilities", () => {
  const result = predictMatch(
    { id: "TEST_EVEN_A" },
    { id: "TEST_EVEN_B" },
    { strength, advantage, rho, isNeutralVenue: true }
  );

  assert.ok(Math.abs(result.probabilities.homeWin - result.probabilities.awayWin) < 1e-9);
  assert.ok(result.probabilities.draw > 0);
});

test("a stronger team receives the higher win probability", () => {
  const result = predictMatch(
    { id: "TEST_STRONG" },
    { id: "TEST_WEAK" },
    { strength, advantage, rho, isNeutralVenue: true }
  );

  assert.ok(result.probabilities.homeWin > result.probabilities.awayWin);
  assert.ok(result.mostLikelyScore.homeGoals >= result.mostLikelyScore.awayGoals);
});

test("scorelines are finite, non-negative, and sorted by probability", () => {
  const result = predictMatch(evenHome, evenAway, { strength, advantage, rho, isNeutralVenue: true });

  for (const scoreline of result.scorelines) {
    assert.ok(Number.isInteger(scoreline.homeGoals) && scoreline.homeGoals >= 0);
    assert.ok(Number.isInteger(scoreline.awayGoals) && scoreline.awayGoals >= 0);
    assert.ok(Number.isFinite(scoreline.probability) && scoreline.probability >= 0);
  }

  assert.ok(result.scorelines[0].probability >= result.scorelines[1].probability);
  assert.ok(result.scorelines[1].probability >= result.scorelines[2].probability);
});

test("predictMatch rejects a team missing from the strength table", () => {
  assert.throws(
    () => predictMatch({ id: "UNKNOWN" }, evenAway, { strength, advantage, rho }),
    TypeError
  );
  assert.throws(
    () => predictMatch(undefined, evenAway, { strength, advantage, rho }),
    /Cannot read properties|requires fitted team-strength/
  );
});

test("winProbability is derived from the same scoreline grid predictMatch builds, not a separate formula", () => {
  const home = { id: "TEST_HOME" };
  const away = { id: "TEST_AWAY" };

  const prediction = predictMatch(home, away, { strength, advantage, rho, isNeutralVenue: true, scorelineCount: 200 });
  const probability = winProbability(home, away, { strength, advantage, rho, isNeutralVenue: true });

  assert.ok(Math.abs(probability - (prediction.probabilities.homeWin + 0.5 * prediction.probabilities.draw)) < 1e-9);
});
