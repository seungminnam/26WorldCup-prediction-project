import assert from "node:assert/strict";
import test from "node:test";

import { buildOutcomePresentation } from "../apps/web/lib/prediction-presentation.js";

test("buildOutcomePresentation uses team names and preserves the probability widths", () => {
  const result = buildOutcomePresentation({
    homeName: "Portugal",
    awayName: "Congo DR",
    probabilities: { homeWin: 0.68, draw: 0.21, awayWin: 0.11 }
  });

  assert.deepEqual(result, [
    { key: "home", label: "Portugal", percentLabel: "68%", width: "68%" },
    { key: "draw", label: "Draw", percentLabel: "21%", width: "21%" },
    { key: "away", label: "Congo DR", percentLabel: "11%", width: "11%" }
  ]);
});

test("buildOutcomePresentation keeps an extreme one-percent segment mathematically honest", () => {
  const result = buildOutcomePresentation({
    homeName: "Portugal",
    awayName: "Congo DR",
    probabilities: { homeWin: 0.91, draw: 0.08, awayWin: 0.01 }
  });

  assert.equal(result[2].label, "Congo DR");
  assert.equal(result[2].percentLabel, "1%");
  assert.equal(result[2].width, "1%");
  assert.equal(result.reduce((sum, outcome) => sum + Number.parseFloat(outcome.width), 0), 100);
});
