import assert from "node:assert/strict";
import test from "node:test";
import { createSportmonksClient } from "../src/provider/sportmonks-client.js";

test("fetches fixtures between dates with required includes", async () => {
  const requests = [];
  const client = createSportmonksClient({
    token: "test-token",
    async fetchImpl(url, options) {
      requests.push(new URL(url));
      assert.ok(options.signal instanceof AbortSignal);
      return {
        ok: true,
        async json() {
          return { data: [{ id: 991001 }] };
        }
      };
    }
  });

  const result = await client.fetchFixturesBetween({
    dateFrom: "2026-06-11",
    dateTo: "2026-07-19"
  });

  assert.deepEqual(result, { data: [{ id: 991001 }] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/v3/football/fixtures/between/2026-06-11/2026-07-19");
  assert.equal(requests[0].searchParams.get("api_token"), "test-token");
  assert.equal(
    requests[0].searchParams.get("include"),
    "participants;league;season;venue;state"
  );
});

test("does not expose the API token in request errors", async () => {
  const client = createSportmonksClient({
    token: "super-secret-token",
    async fetchImpl() {
      return {
        ok: false,
        status: 401,
        async json() {
          return { message: "Unauthorized" };
        }
      };
    }
  });

  await assert.rejects(
    () => client.fetchFixturesBetween({ dateFrom: "2026-06-11", dateTo: "2026-06-12" }),
    (error) => {
      assert.match(error.message, /Sportmonks request failed with status 401/);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    }
  );
});
