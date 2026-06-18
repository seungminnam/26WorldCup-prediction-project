import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeSportmonksLiveScore } from "../src/provider/sportmonks.js";

test("normalizes a Sportmonks-style finished livescore payload", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/sportmonks-live-score.sample.json", import.meta.url), "utf8")
  );

  const result = normalizeSportmonksLiveScore(raw.data);

  assert.deepEqual(result, {
    provider: "sportmonks",
    providerFixtureId: "991001",
    providerLeagueId: null,
    providerSeasonId: null,
    kickoffAt: "2026-06-12T19:00:00Z",
    status: "final",
    home: {
      providerTeamId: "7001",
      name: "Korea Republic",
      code: null,
      goals: 2
    },
    away: {
      providerTeamId: "7002",
      name: "Czechia",
      code: null,
      goals: 1
    },
    events: [
      {
        providerEventId: "880001",
        providerTeamId: "7001",
        playerName: "Lee Kang-in",
        minute: 32,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "880002",
        providerTeamId: "7002",
        playerName: "Patrik Schick",
        minute: 58,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "880003",
        providerTeamId: "7001",
        playerName: "Son Heung-min",
        minute: 83,
        stoppageMinute: null,
        eventType: "goal"
      }
    ]
  });
});
