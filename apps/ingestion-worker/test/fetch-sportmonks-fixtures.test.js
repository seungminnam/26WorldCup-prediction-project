import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFetchSportmonksFixturesArgs,
  runFetchSportmonksFixtures
} from "../src/cli/fetch-sportmonks-fixtures-core.js";

test("parses fixture fetch arguments", () => {
  assert.deepEqual(
    parseFetchSportmonksFixturesArgs([
      "--date-from",
      "2026-06-11",
      "--date-to",
      "2026-07-19",
      "--output",
      ".local-data/sportmonks/fixtures.json"
    ]),
    {
      dateFrom: "2026-06-11",
      dateTo: "2026-07-19",
      outputPath: ".local-data/sportmonks/fixtures.json"
    }
  );
});

test("requires date range and output path", () => {
  assert.throws(() => parseFetchSportmonksFixturesArgs([]), /--date-from is required/);
});

test("fetches fixtures and writes the raw payload without logging credentials", async () => {
  const writes = [];
  const result = await runFetchSportmonksFixtures({
    argv: [
      "--date-from",
      "2026-06-11",
      "--date-to",
      "2026-07-19",
      "--output",
      ".local-data/sportmonks/fixtures.json"
    ],
    cwd: "/repo",
    client: {
      async fetchFixturesBetween(args) {
        assert.deepEqual(args, {
          dateFrom: "2026-06-11",
          dateTo: "2026-07-19"
        });
        return { data: [{ id: 991001 }] };
      }
    },
    async writeJson(filePath, payload) {
      writes.push({ filePath, payload });
    }
  });

  assert.deepEqual(writes, [
    {
      filePath: "/repo/.local-data/sportmonks/fixtures.json",
      payload: { data: [{ id: 991001 }] }
    }
  ]);
  assert.deepEqual(result, {
    outputPath: "/repo/.local-data/sportmonks/fixtures.json",
    fixtureCount: 1,
    providerMessage: null,
    subscriptionPlans: []
  });
});
