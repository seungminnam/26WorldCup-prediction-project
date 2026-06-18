import assert from "node:assert/strict";
import test from "node:test";

import {
  displayFixtureScore,
  shouldShowPreMatchPrediction
} from "../apps/web/lib/fixture-presentation.js";

test("pre-match predictions are visible only for upcoming fixtures", () => {
  assert.equal(shouldShowPreMatchPrediction("Upcoming"), true);
  assert.equal(shouldShowPreMatchPrediction("Live"), false);
  assert.equal(shouldShowPreMatchPrediction("FT"), false);
  assert.equal(shouldShowPreMatchPrediction("Result pending"), false);
  assert.equal(shouldShowPreMatchPrediction("Postponed"), false);
});

test("observed scores appear after kickoff but not before or while postponed", () => {
  assert.equal(displayFixtureScore("Live", 1), 1);
  assert.equal(displayFixtureScore("FT", 2), 2);
  assert.equal(displayFixtureScore("Result pending", 3), 3);
  assert.equal(displayFixtureScore("Upcoming", 0), "-");
  assert.equal(displayFixtureScore("Postponed", 0), "-");
  assert.equal(displayFixtureScore("Live", undefined), "-");
});
