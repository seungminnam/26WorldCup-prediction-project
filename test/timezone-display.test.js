import assert from "node:assert/strict";
import test from "node:test";

import {
  detectViewerTimeZone,
  formatKickoffDateKey,
  formatKickoffShortDate,
  formatKickoffTime
} from "../apps/web/lib/timezone-display.js";

const KICKOFF = "2026-06-19T01:00:00+00:00";

test("formatKickoffDateKey always groups by UTC regardless of caller intent", () => {
  assert.equal(formatKickoffDateKey(KICKOFF), "2026-06-19");
});

test("formatKickoffShortDate renders the date in the given zone, which can shift the day", () => {
  assert.equal(formatKickoffShortDate(KICKOFF, "Asia/Seoul"), "Fri, Jun 19");
  assert.equal(formatKickoffShortDate(KICKOFF, "America/New_York"), "Thu, Jun 18");
});

test("formatKickoffTime renders the time with an inline short zone abbreviation", () => {
  assert.equal(formatKickoffTime(KICKOFF, "Asia/Seoul"), "10:00 AM GMT+9");
  assert.equal(formatKickoffTime(KICKOFF, "America/New_York"), "9:00 PM EDT");
  assert.equal(formatKickoffTime(KICKOFF, "UTC"), "1:00 AM UTC");
});

test("detectViewerTimeZone returns a non-empty IANA zone string", () => {
  const zone = detectViewerTimeZone();
  assert.equal(typeof zone, "string");
  assert.ok(zone.length > 0);
});
