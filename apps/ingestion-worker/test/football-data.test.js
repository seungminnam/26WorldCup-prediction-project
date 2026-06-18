import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeFootballDataMatch,
  normalizeFootballDataPayload,
  normalizeFootballDataStatus
} from "../src/provider/football-data.js";

test("normalizes a finished football-data.org match", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataMatch(raw.matches[0]);

  assert.deepEqual(result, {
    provider: "football-data",
    providerFixtureId: "537327",
    kickoffAt: "2026-06-11T19:00:00Z",
    status: "final",
    home: { name: "Mexico", goals: 2 },
    away: { name: "South Africa", goals: 0 }
  });
});

test("normalizes a scheduled match with null goals", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataMatch(raw.matches[1]);
  assert.equal(result.status, "scheduled");
  assert.equal(result.home.goals, null);
  assert.equal(result.away.goals, null);
});

test("status mapping covers all known football-data.org statuses", () => {
  const cases = [
    ["SCHEDULED", "scheduled"],
    ["TIMED", "scheduled"],
    ["IN_PLAY", "live"],
    ["PAUSED", "live"],
    ["FINISHED", "final"],
    ["AWARDED", "final"],
    ["POSTPONED", "postponed"],
    ["CANCELLED", "postponed"],
    ["SUSPENDED", "result_pending"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeFootballDataStatus(input), expected, input);
  }
});

test("normalizeFootballDataPayload maps every match in the response", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/football-data-matches.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeFootballDataPayload(raw);
  assert.equal(result.length, 2);
});

test("rejects a payload without a matches array", () => {
  assert.throws(() => normalizeFootballDataPayload({}), /matches array/);
});
