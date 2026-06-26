import assert from "node:assert/strict";
import test from "node:test";

import { computeCompletedGroups } from "../lib/fixture-presentation.js";

test("a group with every fixture FT and scored is complete", () => {
  const fixtures = [
    { group: "A", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "A", status: "FT", homeGoals: 1, awayGoals: 1 },
    { group: "A", status: "FT", homeGoals: 0, awayGoals: 3 }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(completed.has("A"));
});

test("a group with one unfinished fixture is not complete", () => {
  const fixtures = [
    { group: "B", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "B", status: "Upcoming", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("B"));
});

test("a group with zero fixtures played is not complete", () => {
  const fixtures = [
    { group: "C", status: "Upcoming", homeGoals: undefined, awayGoals: undefined },
    { group: "C", status: "Upcoming", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("C"));
});

test("non-group (knockout) fixtures with a null group are ignored", () => {
  const fixtures = [
    { group: "D", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: null, status: "FT", homeGoals: 1, awayGoals: 0 }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(completed.has("D"));
  assert.equal(completed.size, 1);
});

test("a fixture marked FT but missing a score does not count as complete", () => {
  const fixtures = [
    { group: "E", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "E", status: "FT", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("E"));
});
