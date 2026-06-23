import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIVE_SYNC_AFTER_MS,
  DEFAULT_LIVE_SYNC_BEFORE_MS,
  findLiveSyncWindow,
  shouldRunLiveSync
} from "../lib/live-sync-window.ts";

const fixtures = [
  {
    id: "G-1",
    matchNumber: 1,
    kickoff: "2026-06-23T03:00:00.000Z"
  },
  {
    id: "G-2",
    matchNumber: 2,
    kickoff: "2026-06-24T03:00:00.000Z"
  }
];

test("runs during the configured live sync window", () => {
  assert.equal(
    shouldRunLiveSync(fixtures, new Date("2026-06-23T05:59:00.000Z")),
    true
  );
  assert.equal(
    shouldRunLiveSync(fixtures, new Date("2026-06-23T06:01:00.000Z")),
    false
  );
});

test("opens the sync window before kickoff", () => {
  assert.equal(
    shouldRunLiveSync(fixtures, new Date("2026-06-23T02:31:00.000Z")),
    true
  );
  assert.equal(
    shouldRunLiveSync(fixtures, new Date("2026-06-23T02:29:00.000Z")),
    false
  );
});

test("reports active fixture ids and the next sync window", () => {
  const active = findLiveSyncWindow(fixtures, new Date("2026-06-23T03:15:00.000Z"));

  assert.deepEqual(active.activeFixtureIds, ["G-1"]);
  assert.equal(active.nextWindow, null);

  const upcoming = findLiveSyncWindow(fixtures, new Date("2026-06-23T06:01:00.000Z"));

  assert.deepEqual(upcoming.activeFixtureIds, []);
  assert.deepEqual(upcoming.nextWindow, {
    fixtureId: "G-2",
    matchNumber: 2,
    kickoff: "2026-06-24T03:00:00.000Z",
    startsAt: new Date(
      new Date("2026-06-24T03:00:00.000Z").getTime() - DEFAULT_LIVE_SYNC_BEFORE_MS
    ).toISOString(),
    endsAt: new Date(
      new Date("2026-06-24T03:00:00.000Z").getTime() + DEFAULT_LIVE_SYNC_AFTER_MS
    ).toISOString()
  });
});

test("ignores fixtures without valid kickoff timestamps", () => {
  const result = findLiveSyncWindow(
    [{ id: "bad", matchNumber: 99, kickoff: "not-a-date" }],
    new Date("2026-06-23T03:15:00.000Z")
  );

  assert.deepEqual(result.activeFixtureIds, []);
  assert.equal(result.nextWindow, null);
});
