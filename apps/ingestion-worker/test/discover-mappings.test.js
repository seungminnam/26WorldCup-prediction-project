import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { discoverProviderMappings } from "../src/mapping/discover-provider-mappings.js";
import { normalizeProviderFixturePayload } from "../src/provider/provider-fixtures.js";

test("discovers mappings from provider-neutral fixtures", async () => {
  const local = JSON.parse(await readFile(new URL("./fixtures/local-tournament.sample.json", import.meta.url), "utf8"));

  const result = discoverProviderMappings({
    local,
    providerFixtures: [
      {
        providerFixtureId: "1199001",
        providerLeagueId: "1",
        providerSeasonId: "2026",
        kickoffAt: "2026-06-12T19:00:00+00:00",
        home: {
          providerTeamId: "7001",
          name: "Korea Republic",
          code: "KOR"
        },
        away: {
          providerTeamId: "7002",
          name: "Czechia",
          code: "CZE"
        }
      }
    ],
    provider: {
      id: "api-football",
      name: "API-Football",
      baseUrl: "https://v3.football.api-sports.io",
      status: "evaluation"
    }
  });

  assert.deepEqual(result, {
    provider: {
      id: "api-football",
      name: "API-Football",
      baseUrl: "https://v3.football.api-sports.io",
      status: "evaluation",
      notes: "Discovered from sanitized provider fixture payload."
    },
    teams: [
      {
        teamId: "KOR",
        providerTeamId: "7001",
        providerName: "Korea Republic",
        providerCode: "KOR"
      },
      {
        teamId: "CZE",
        providerTeamId: "7002",
        providerName: "Czechia",
        providerCode: "CZE"
      }
    ],
    fixtures: [
      {
        fixtureId: "A-2",
        providerFixtureId: "1199001",
        providerSeasonId: "2026",
        providerLeagueId: "1",
        lastPayloadHash: "api-football:1199001:2026-06-12T19:00:00+00:00:7001:7002"
      }
    ]
  });
});

test("normalizeProviderFixturePayload filters ESPN placeholder fixtures with knownTeamIds", async () => {
  const scoreboard = JSON.parse(
    await readFile(new URL("./fixtures/espn-scoreboard.sample.json", import.meta.url), "utf8")
  );
  const knownTeamIds = new Set(["203", "774", "773"]);

  const result = normalizeProviderFixturePayload("espn", scoreboard, { knownTeamIds });
  assert.equal(result.length, 2);
});

test("rejects provider fixtures that cannot be matched to a local fixture", () => {
  assert.throws(
    () =>
      discoverProviderMappings({
        local: {
          teams: [],
          fixtures: []
        },
        providerFixtures: [
          {
            providerFixtureId: "1199001",
            kickoffAt: "2026-06-12T19:00:00+00:00",
            home: { providerTeamId: "7001", name: "Korea Republic", code: "KOR" },
            away: { providerTeamId: "7002", name: "Czechia", code: "CZE" }
          }
        ],
        provider: {
          id: "api-football",
          name: "API-Football"
        }
      }),
    /No local fixture match for provider fixture api-football:1199001/
  );
});
