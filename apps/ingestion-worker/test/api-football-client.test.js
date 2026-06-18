import assert from "node:assert/strict";
import test from "node:test";
import { createApiFootballClient } from "../src/provider/api-football-client.js";

test("requires a private API-Football key", () => {
  assert.throws(() => createApiFootballClient({ apiKey: "" }), /API_FOOTBALL_API_KEY is required/);
});

test("fetches World Cup fixtures between dates and returns quota metadata", async () => {
  const requests = [];
  const client = createApiFootballClient({
    apiKey: "test-api-key",
    async fetchImpl(url, options) {
      requests.push({ url: new URL(url), options });
      return successResponse(
        { response: [{ fixture: { id: 1199001 } }], errors: [] },
        {
          "x-ratelimit-requests-limit": "100",
          "x-ratelimit-requests-remaining": "87",
          "x-ratelimit-requests-reset": "1781740800"
        }
      );
    }
  });

  const result = await client.fetchFixturesBetween({
    dateFrom: "2026-06-11",
    dateTo: "2026-07-19"
  });

  assert.deepEqual(result, {
    payload: { response: [{ fixture: { id: 1199001 } }], errors: [] },
    rateLimit: {
      limit: 100,
      remaining: 87,
      resetAt: 1781740800
    }
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/fixtures");
  assert.equal(requests[0].url.searchParams.get("league"), "1");
  assert.equal(requests[0].url.searchParams.get("season"), "2026");
  assert.equal(requests[0].url.searchParams.get("from"), "2026-06-11");
  assert.equal(requests[0].url.searchParams.get("to"), "2026-07-19");
  assert.equal(requests[0].url.searchParams.get("timezone"), "UTC");
  assert.equal(requests[0].url.searchParams.has("apiKey"), false);
  assert.equal(requests[0].options.headers["x-apisports-key"], "test-api-key");
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test("fetches only live World Cup fixtures", async () => {
  let requestedUrl;
  const client = createApiFootballClient({
    apiKey: "test-api-key",
    async fetchImpl(url) {
      requestedUrl = new URL(url);
      return successResponse({ response: [], errors: [] });
    }
  });

  await client.fetchLiveFixtures();

  assert.equal(requestedUrl.pathname, "/fixtures");
  assert.deepEqual(Array.from(requestedUrl.searchParams.entries()), [["live", "1"]]);
});

test("does not expose the key in HTTP errors", async () => {
  const client = createApiFootballClient({
    apiKey: "super-secret-key",
    async fetchImpl() {
      return {
        ok: false,
        status: 401,
        headers: new Headers(),
        async json() {
          return { message: "Unauthorized: super-secret-key" };
        }
      };
    }
  });

  await assert.rejects(
    () => client.fetchLiveFixtures(),
    (error) => {
      assert.match(error.message, /API-Football request failed with status 401/);
      assert.doesNotMatch(error.message, /super-secret-key/);
      return true;
    }
  );
});

test("rejects provider error envelopes", async () => {
  const client = createApiFootballClient({
    apiKey: "test-api-key",
    async fetchImpl() {
      return successResponse({ response: [], errors: { requests: "Daily limit reached" } });
    }
  });

  await assert.rejects(
    () => client.fetchLiveFixtures(),
    /API-Football returned provider errors/
  );
});

function successResponse(payload, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    async json() {
      return payload;
    }
  };
}
