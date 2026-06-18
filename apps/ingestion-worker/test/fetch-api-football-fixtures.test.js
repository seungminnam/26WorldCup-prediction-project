import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFetchApiFootballFixturesArgs,
  runFetchApiFootballFixtures
} from "../src/cli/fetch-api-football-fixtures-core.js";

test("parses API-Football fixture fetch arguments", () => {
  assert.deepEqual(
    parseFetchApiFootballFixturesArgs([
      "--date-from",
      "2026-06-11",
      "--date-to",
      "2026-07-19",
      "--output",
      ".local-data/api-football/fixtures.json"
    ]),
    {
      dateFrom: "2026-06-11",
      dateTo: "2026-07-19",
      outputPath: ".local-data/api-football/fixtures.json"
    }
  );
});

test("requires a date range and output path", () => {
  assert.throws(() => parseFetchApiFootballFixturesArgs([]), /--date-from is required/);
  assert.throws(
    () => parseFetchApiFootballFixturesArgs(["--date-from", "2026-06-11"]),
    /--date-to is required/
  );
});

test("writes only the raw payload and returns a credential-free summary", async () => {
  const writes = [];
  const result = await runFetchApiFootballFixtures({
    argv: [
      "--date-from",
      "2026-06-11",
      "--date-to",
      "2026-07-19",
      "--output",
      ".local-data/api-football/fixtures.json"
    ],
    cwd: "/repo",
    client: {
      async fetchFixturesBetween(args) {
        assert.deepEqual(args, {
          dateFrom: "2026-06-11",
          dateTo: "2026-07-19"
        });
        return {
          payload: { response: [{ fixture: { id: 1199001 } }] },
          rateLimit: { limit: 100, remaining: 87, resetAt: null }
        };
      }
    },
    async writeJson(filePath, payload) {
      writes.push({ filePath, payload });
    }
  });

  assert.deepEqual(writes, [
    {
      filePath: "/repo/.local-data/api-football/fixtures.json",
      payload: { response: [{ fixture: { id: 1199001 } }] }
    }
  ]);
  assert.deepEqual(result, {
    outputPath: "/repo/.local-data/api-football/fixtures.json",
    fixtureCount: 1,
    rateLimit: { limit: 100, remaining: 87, resetAt: null }
  });
  assert.doesNotMatch(JSON.stringify(result), /api.key|credential|token/i);
});
