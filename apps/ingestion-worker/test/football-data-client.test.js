import assert from "node:assert/strict";
import test from "node:test";
import { createFootballDataClient } from "../src/provider/football-data-client.js";

function fakeFetch(responder) {
  return async (url, init) => responder(url.toString(), init);
}

test("throws without a token", () => {
  assert.throws(() => createFootballDataClient({}), /FOOTBALL_DATA_API_TOKEN is required/);
});

test("fetchFixturesBetween calls the WC matches endpoint with the auth header", async () => {
  let requestedUrl;
  let requestedHeaders;
  const client = createFootballDataClient({
    apiToken: "test-token",
    fetchImpl: fakeFetch((url, init) => {
      requestedUrl = url;
      requestedHeaders = init.headers;
      return { ok: true, status: 200, json: async () => ({ matches: [] }) };
    })
  });

  await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-19" });

  assert.match(requestedUrl, /\/competitions\/WC\/matches\?/);
  assert.match(requestedUrl, /dateFrom=2026-06-18/);
  assert.match(requestedUrl, /dateTo=2026-06-19/);
  assert.equal(requestedHeaders["X-Auth-Token"], "test-token");
});

test("rejects with a status-coded error and never includes the token", async () => {
  const client = createFootballDataClient({
    apiToken: "test-token",
    fetchImpl: fakeFetch(() => ({ ok: false, status: 403, json: async () => ({}) }))
  });

  await assert.rejects(
    client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-18" }),
    (error) => {
      assert.match(error.message, /football-data\.org request failed with status 403/);
      assert.doesNotMatch(error.message, /test-token/);
      return true;
    }
  );
});
