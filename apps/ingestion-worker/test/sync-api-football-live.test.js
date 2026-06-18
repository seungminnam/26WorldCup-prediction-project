import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runSyncApiFootballLive } from "../src/cli/sync-api-football-live-core.js";

const payload = JSON.parse(
  await readFile(new URL("./fixtures/api-football-live-score.sample.json", import.meta.url), "utf8")
);

test("builds a live sync dry run without database writes", async () => {
  const calls = [];
  const result = await runSyncApiFootballLive({
    argv: [],
    client: createClient({ limit: 100, remaining: 87, resetAt: null }),
    store: createStore(calls)
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.fixtureCount, 1);
  assert.equal(result.quotaState, "normal");
  assert.deepEqual(result.fixtureIds, ["A-2"]);
  assert.deepEqual(calls, ["load:api-football"]);
});

test("applies plans and records a completed ingestion run", async () => {
  const calls = [];
  const result = await runSyncApiFootballLive({
    argv: ["--apply"],
    client: createClient({ limit: 100, remaining: 9, resetAt: null }),
    store: createStore(calls)
  });

  assert.equal(result.mode, "apply");
  assert.equal(result.quotaState, "reserve");
  assert.deepEqual(calls, [
    "load:api-football",
    "apply:A-2",
    {
      source: "api-football",
      status: "completed",
      rowsSeen: 1,
      rowsChanged: 1,
      errorMessage: null,
      metadata: {
        rateLimit: { limit: 100, remaining: 9, resetAt: null },
        quotaState: "reserve"
      }
    }
  ]);
});

test("records a failed apply and rethrows the original error", async () => {
  const calls = [];
  const expectedError = new Error("fixture write failed");
  const store = createStore(calls);
  store.applyLiveScorePlan = async () => {
    calls.push("apply:A-2");
    throw expectedError;
  };

  await assert.rejects(
    () => runSyncApiFootballLive({ argv: ["--apply"], client: createClient(), store }),
    expectedError
  );
  assert.equal(calls.at(-1).status, "failed");
  assert.equal(calls.at(-1).errorMessage, "fixture write failed");
});

test("rejects unmapped provider fixtures before applying", async () => {
  const calls = [];
  const store = createStore(calls);
  store.loadProviderMappings = async () => {
    calls.push("load:api-football");
    return {
      fixtureByProviderId: new Map(),
      teamByProviderId: new Map()
    };
  };

  await assert.rejects(
    () => runSyncApiFootballLive({ argv: ["--apply"], client: createClient(), store }),
    /No local fixture mapping for api-football:1199001/
  );
  assert.deepEqual(calls, ["load:api-football"]);
});

function createClient(rateLimit = { limit: 100, remaining: 87, resetAt: null }) {
  return {
    async fetchLiveFixtures() {
      return { payload, rateLimit };
    }
  };
}

function createStore(calls) {
  return {
    async loadProviderMappings(providerId) {
      calls.push(`load:${providerId}`);
      return {
        fixtureByProviderId: new Map([["1199001", "A-2"]]),
        teamByProviderId: new Map([
          ["7001", "KOR"],
          ["7002", "CZE"]
        ])
      };
    },
    async applyLiveScorePlan(plan) {
      calls.push(`apply:${plan.fixture.id}`);
    },
    async recordIngestionRun(run) {
      calls.push(run);
    }
  };
}
