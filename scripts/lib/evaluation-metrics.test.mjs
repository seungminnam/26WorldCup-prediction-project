import assert from "node:assert/strict";
import test from "node:test";

import { accuracy, brierScore, logLoss } from "./evaluation-metrics.mjs";

const predictions = [
  { probabilities: { homeWin: 0.7, draw: 0.2, awayWin: 0.1 }, actual: "homeWin" },
  { probabilities: { homeWin: 0.3, draw: 0.3, awayWin: 0.4 }, actual: "awayWin" },
  { probabilities: { homeWin: 0.5, draw: 0.3, awayWin: 0.2 }, actual: "draw" }
];

test("accuracy counts predictions whose highest-probability outcome matches the actual outcome", () => {
  assert.ok(Math.abs(accuracy(predictions) - 2 / 3) < 1e-9);
});

test("logLoss matches the hand-computed multi-class log loss", () => {
  const expected = -(Math.log(0.7) + Math.log(0.4) + Math.log(0.3)) / 3;
  assert.ok(Math.abs(logLoss(predictions) - expected) < 1e-9);
});

test("brierScore matches the hand-computed multi-class Brier score", () => {
  const expected =
    ((1 - 0.7) ** 2 + 0.2 ** 2 + 0.1 ** 2 +
      0.3 ** 2 + 0.3 ** 2 + (1 - 0.4) ** 2 +
      0.5 ** 2 + (1 - 0.3) ** 2 + 0.2 ** 2) /
    3;
  assert.ok(Math.abs(brierScore(predictions) - expected) < 1e-9);
});

test("a perfect-confidence, always-correct predictor scores 0 on both log loss and Brier score", () => {
  const perfect = [{ probabilities: { homeWin: 1, draw: 0, awayWin: 0 }, actual: "homeWin" }];
  assert.ok(Math.abs(logLoss(perfect)) < 1e-9);
  assert.ok(Math.abs(brierScore(perfect)) < 1e-9);
});
