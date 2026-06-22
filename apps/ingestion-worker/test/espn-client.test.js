import assert from "node:assert/strict";
import test from "node:test";
import { createEspnClient } from "../src/provider/espn-client.js";

function fakeFetch(responder) {
  return async (url) => responder(url.toString());
}

test("fetchFixturesBetween calls the scoreboard endpoint with a compact date range", async () => {
  let requestedUrl;
  const client = createEspnClient({
    fetchImpl: fakeFetch((url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    })
  });

  await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-19" });

  assert.match(requestedUrl, /\/scoreboard\?/);
  assert.match(requestedUrl, /dates=20260618-20260619/);
  assert.match(requestedUrl, /limit=200/);
});

test("fetchTeams calls the teams endpoint", async () => {
  let requestedUrl;
  const client = createEspnClient({
    fetchImpl: fakeFetch((url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ sports: [] }) };
    })
  });

  await client.fetchTeams();

  assert.match(requestedUrl, /\/teams\?/);
  assert.match(requestedUrl, /limit=60/);
});

test("rejects with a status-coded error on a non-ok response", async () => {
  const client = createEspnClient({
    fetchImpl: fakeFetch(() => ({ ok: false, status: 503, json: async () => ({}) }))
  });

  await assert.rejects(client.fetchTeams(), /ESPN request failed with status 503/);
});

test("returns the parsed payload on success", async () => {
  const client = createEspnClient({
    fetchImpl: fakeFetch(() => ({ ok: true, status: 200, json: async () => ({ events: [{ id: "1" }] }) }))
  });

  const result = await client.fetchFixturesBetween({ dateFrom: "2026-06-18", dateTo: "2026-06-18" });
  assert.deepEqual(result, { events: [{ id: "1" }] });
});

test("fetches the complete World Cup scoreboard window", async () => {
  let requestedUrl;
  let requestedOptions;
  const client = createEspnClient({
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedOptions = options;
      return { ok: true, json: async () => ({ events: [{ id: "760415" }] }) };
    }
  });

  const events = await client.fetchTournamentEvents();

  assert.equal(events.length, 1);
  assert.equal(requestedUrl.searchParams.get("dates"), "20260611-20260719");
  assert.equal(requestedUrl.searchParams.get("limit"), "200");
  assert.ok(requestedOptions.signal instanceof AbortSignal);
});
