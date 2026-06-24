import assert from "node:assert/strict";
import test from "node:test";

import { computeLambda, poissonProbability, scorelineProbability, tauAdjustment } from "../src/engine/dixon-coles.js";

test("computeLambda applies home advantage only when explicitly requested", () => {
  const withAdvantage = computeLambda(0.4, 0.1, { homeAdvantage: 0.3, applyHomeAdvantage: true });
  const withoutAdvantage = computeLambda(0.4, 0.1, { homeAdvantage: 0.3, applyHomeAdvantage: false });

  assert.equal(withoutAdvantage, Math.exp(0.4 - 0.1));
  assert.equal(withAdvantage, Math.exp(0.4 - 0.1 + 0.3));
  assert.ok(withAdvantage > withoutAdvantage);
});

test("poissonProbability matches the textbook formula", () => {
  const probability = poissonProbability(2, 1.5);
  const expected = (Math.exp(-1.5) * 1.5 ** 2) / 2;
  assert.ok(Math.abs(probability - expected) < 1e-12);
});

test("tauAdjustment matches the Dixon-Coles low-score correction exactly at each special case", () => {
  const lambdaHome = 1.2;
  const lambdaAway = 0.9;
  const rho = -0.1;

  assert.ok(Math.abs(tauAdjustment(0, 0, lambdaHome, lambdaAway, rho) - (1 - lambdaHome * lambdaAway * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(0, 1, lambdaHome, lambdaAway, rho) - (1 + lambdaHome * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(1, 0, lambdaHome, lambdaAway, rho) - (1 + lambdaAway * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(1, 1, lambdaHome, lambdaAway, rho) - (1 - rho)) < 1e-12);
  assert.equal(tauAdjustment(2, 2, lambdaHome, lambdaAway, rho), 1);
  assert.equal(tauAdjustment(3, 0, lambdaHome, lambdaAway, rho), 1);
});

test("scorelineProbability multiplies the tau adjustment into the independent Poisson product", () => {
  const lambdaHome = 1.2;
  const lambdaAway = 0.9;
  const rho = -0.1;

  const probability = scorelineProbability(0, 0, lambdaHome, lambdaAway, rho);
  const expected =
    (1 - lambdaHome * lambdaAway * rho) * poissonProbability(0, lambdaHome) * poissonProbability(0, lambdaAway);

  assert.ok(Math.abs(probability - expected) < 1e-12);
});

test("scorelineProbability with rho=0 reduces to the plain independent-Poisson product", () => {
  const probability = scorelineProbability(1, 2, 1.1, 0.8, 0);
  const expected = poissonProbability(1, 1.1) * poissonProbability(2, 0.8);
  assert.ok(Math.abs(probability - expected) < 1e-12);
});
