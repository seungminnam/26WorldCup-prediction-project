import assert from "node:assert/strict";
import test from "node:test";

import {
  detectViewerTimeZone,
  formatKickoffDateKey,
  formatKickoffShortDate,
  formatKickoffTime,
  selectDefaultFixtureDate
} from "../apps/web/lib/timezone-display.js";
import { canonicalSchedule } from "../packages/tournament-engine/src/index.js";

const KICKOFF = "2026-06-19T01:00:00+00:00";

test("formatKickoffDateKey groups by the viewer timezone", () => {
  assert.equal(formatKickoffDateKey(KICKOFF, "Asia/Seoul"), "2026-06-19");
  assert.equal(formatKickoffDateKey(KICKOFF, "America/New_York"), "2026-06-18");
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

test("KST groups matches 41, 42, and 43 under June 23", () => {
  const dateKeys = [41, 42, 43].map((matchNumber) => {
    const fixture = canonicalSchedule.find((match) => match.matchNumber === matchNumber);
    assert.ok(fixture);
    return formatKickoffDateKey(fixture.kickoff, "Asia/Seoul");
  });

  assert.deepEqual(dateKeys, ["2026-06-23", "2026-06-23", "2026-06-23"]);
});

test("KST June 23 contains the expected canonical match set", () => {
  const matchNumbers = canonicalSchedule
    .filter((fixture) => formatKickoffDateKey(fixture.kickoff, "Asia/Seoul") === "2026-06-23")
    .map((fixture) => fixture.matchNumber);

  assert.deepEqual(matchNumbers, [41, 42, 43, 44]);
});

test("selectDefaultFixtureDate picks the viewer's today when matches exist", () => {
  assert.equal(
    selectDefaultFixtureDate(canonicalSchedule, "Asia/Seoul", new Date("2026-06-23T02:50:00.000Z")),
    "2026-06-23"
  );
});

test("selectDefaultFixtureDate falls back to the next kickoff regardless of fixture order", () => {
  const fixtures = [
    { kickoff: "2026-06-25T00:00:00.000Z" },
    { kickoff: "2026-06-24T00:00:00.000Z" }
  ];

  assert.equal(
    selectDefaultFixtureDate(fixtures, "Asia/Seoul", new Date("2026-06-23T00:00:00.000Z")),
    "2026-06-24"
  );
});
