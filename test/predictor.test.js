import assert from "node:assert/strict";
import test from "node:test";

import { predictMatch } from "../packages/tournament-engine/src/engine/predictor.js";

const evenHome = { id: "home", name: "Home", rating: 1700 };
const evenAway = { id: "away", name: "Away", rating: 1700 };

test("predictMatch returns a normalized provider-neutral contract", () => {
  const result = predictMatch(evenHome, evenAway);
  const total = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;

  assert.equal(result.model.id, "rating-poisson-v1");
  assert.equal(result.model.trained, false);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.equal(result.scorelines.length, 3);
  assert.deepEqual(result.mostLikelyScore, result.scorelines[0]);
});

test("equal ratings produce symmetric home and away win probabilities", () => {
  const result = predictMatch(evenHome, evenAway);

  assert.ok(Math.abs(result.probabilities.homeWin - result.probabilities.awayWin) < 1e-12);
  assert.ok(result.probabilities.draw > 0);
});

test("a stronger team receives the higher win probability", () => {
  const result = predictMatch(
    { id: "strong", name: "Strong", rating: 1950 },
    { id: "weak", name: "Weak", rating: 1450 }
  );

  assert.ok(result.probabilities.homeWin > result.probabilities.awayWin);
  assert.ok(result.mostLikelyScore.homeGoals >= result.mostLikelyScore.awayGoals);
});

test("scorelines are finite, non-negative, and sorted by probability", () => {
  const result = predictMatch(evenHome, evenAway);

  for (const scoreline of result.scorelines) {
    assert.ok(Number.isInteger(scoreline.homeGoals) && scoreline.homeGoals >= 0);
    assert.ok(Number.isInteger(scoreline.awayGoals) && scoreline.awayGoals >= 0);
    assert.ok(Number.isFinite(scoreline.probability) && scoreline.probability >= 0);
  }

  assert.ok(result.scorelines[0].probability >= result.scorelines[1].probability);
  assert.ok(result.scorelines[1].probability >= result.scorelines[2].probability);
});

test("predictMatch rejects missing or invalid ratings", () => {
  assert.throws(() => predictMatch({ rating: Number.NaN }, evenAway), /finite team ratings/);
  assert.throws(() => predictMatch(undefined, evenAway), /finite team ratings/);
});
