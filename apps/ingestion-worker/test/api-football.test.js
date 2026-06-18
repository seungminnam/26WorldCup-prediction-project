import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeApiFootballFixture,
  normalizeApiFootballPayload,
  normalizeApiFootballStatus
} from "../src/provider/api-football.js";

test("normalizes an API-Football penalty shootout fixture", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/api-football-live-score.sample.json", import.meta.url), "utf8")
  );

  assert.deepEqual(normalizeApiFootballFixture(raw.response[0]), {
    provider: "api-football",
    providerFixtureId: "1199001",
    providerLeagueId: "1",
    providerSeasonId: "2026",
    kickoffAt: "2026-06-12T19:00:00+00:00",
    venue: {
      providerVenueId: "501",
      name: "Sample Stadium"
    },
    round: "Round of 32",
    elapsed: 120,
    status: "final",
    home: {
      providerTeamId: "7001",
      name: "Korea Republic",
      code: "KOR",
      goals: 2,
      penalties: 4
    },
    away: {
      providerTeamId: "7002",
      name: "Czechia",
      code: "CZE",
      goals: 2,
      penalties: 3
    },
    events: [
      {
        providerEventId: "1199001:7001:32:0:Goal:Normal Goal:801",
        providerTeamId: "7001",
        playerName: "Lee Kang-in",
        assistPlayerName: "Son Heung-min",
        minute: 32,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "1199001:7002:90:4:Goal:Penalty:803",
        providerTeamId: "7002",
        playerName: "Patrik Schick",
        assistPlayerName: null,
        minute: 90,
        stoppageMinute: 4,
        eventType: "penalty_goal"
      }
    ]
  });
});

test("normalizes API-Football status codes", () => {
  const cases = [
    ["NS", "scheduled"],
    ["1H", "live"],
    ["HT", "live"],
    ["FT", "final"],
    ["AET", "final"],
    ["PEN", "final"],
    ["PST", "postponed"],
    ["CANC", "postponed"],
    ["SUSP", "result_pending"],
    ["ABD", "result_pending"]
  ];

  for (const [providerStatus, canonicalStatus] of cases) {
    assert.equal(normalizeApiFootballStatus(providerStatus), canonicalStatus);
  }
});

test("clears scores for fixtures without a canonical live or final result", () => {
  for (const providerStatus of ["NS", "PST", "SUSP"]) {
    const normalized = normalizeApiFootballFixture(makeFixture({ status: providerStatus }));
    assert.equal(normalized.home.goals, null);
    assert.equal(normalized.away.goals, null);
    assert.equal(normalized.home.penalties, null);
    assert.equal(normalized.away.penalties, null);
  }
});

test("rejects malformed provider envelopes and missing participants", () => {
  assert.throws(
    () => normalizeApiFootballPayload({ data: [] }),
    /API-Football response must contain a response array/
  );
  assert.throws(
    () => normalizeApiFootballFixture(makeFixture({ away: null })),
    /API-Football fixture 1199001 is missing home or away team/
  );
});

function makeFixture({ status = "FT", away = { id: 7002, name: "Czechia", code: "CZE" } } = {}) {
  return {
    fixture: {
      id: 1199001,
      date: "2026-06-12T19:00:00+00:00",
      status: { short: status, elapsed: null },
      venue: { id: 501, name: "Sample Stadium" }
    },
    league: { id: 1, season: 2026, round: "Group A - 1" },
    teams: {
      home: { id: 7001, name: "Korea Republic", code: "KOR" },
      away
    },
    goals: { home: 1, away: 0 },
    score: { penalty: { home: null, away: null } },
    events: []
  };
}
