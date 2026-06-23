import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_REFRESH_INTERVAL_MS,
  shouldShowDataLoadedAt,
  shouldRefreshLiveData,
  formatDataLoadedAt
} from "../lib/live-refresh.ts";

test("uses a one minute live refresh interval", () => {
  assert.equal(LIVE_REFRESH_INTERVAL_MS, 60_000);
});

test("refreshes only when the document is visible and data came from Supabase", () => {
  assert.equal(shouldRefreshLiveData({ dataSource: "supabase", visibilityState: "visible" }), true);
  assert.equal(shouldRefreshLiveData({ dataSource: "supabase", visibilityState: "hidden" }), false);
  assert.equal(shouldRefreshLiveData({ dataSource: "seed", visibilityState: "visible" }), false);
});

test("formats loaded-at timestamps in the viewer timezone", () => {
  assert.equal(
    formatDataLoadedAt("2026-06-23T02:50:00.000Z", "Asia/Seoul"),
    "11:50 AM GMT+9"
  );
});

test("shows loaded-at timestamps only after client timezone detection", () => {
  assert.equal(
    shouldShowDataLoadedAt({ fetchedAt: "2026-06-23T02:50:00.000Z", viewerTimeZoneDetected: true }),
    true
  );
  assert.equal(
    shouldShowDataLoadedAt({ fetchedAt: "2026-06-23T02:50:00.000Z", viewerTimeZoneDetected: false }),
    false
  );
  assert.equal(shouldShowDataLoadedAt({ fetchedAt: undefined, viewerTimeZoneDetected: true }), false);
});
