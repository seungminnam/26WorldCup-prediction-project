import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { discoverProviderMappings } from "../src/mapping/discover-provider-mappings.js";

test("discovers provider team and fixture mappings from local and Sportmonks fixture payloads", async () => {
  const local = JSON.parse(await readFile(new URL("./fixtures/local-tournament.sample.json", import.meta.url), "utf8"));
  const providerFixtures = JSON.parse(
    await readFile(new URL("./fixtures/sportmonks-fixtures.sample.json", import.meta.url), "utf8")
  );

  const result = discoverProviderMappings({
    local,
    providerFixtures: providerFixtures.data,
    provider: {
      id: "sportmonks",
      name: "Sportmonks",
      baseUrl: "https://api.sportmonks.com",
      status: "evaluation"
    }
  });

  assert.deepEqual(result, {
    provider: {
      id: "sportmonks",
      name: "Sportmonks",
      baseUrl: "https://api.sportmonks.com",
      status: "evaluation",
      notes: "Discovered from sanitized provider fixture payload."
    },
    teams: [
      {
        teamId: "KOR",
        providerTeamId: "7001",
        providerName: "Korea Republic",
        providerCode: null
      },
      {
        teamId: "CZE",
        providerTeamId: "7002",
        providerName: "Czechia",
        providerCode: null
      }
    ],
    fixtures: [
      {
        fixtureId: "A-2",
        providerFixtureId: "991001",
        providerSeasonId: "2026",
        providerLeagueId: "9001",
        lastPayloadHash: "sportmonks:991001:2026-06-12T19:00:00Z:7001:7002"
      }
    ]
  });
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
            id: 991001,
            starting_at: "2026-06-12T19:00:00Z",
            participants: [
              {
                id: 7001,
                name: "Korea Republic",
                meta: {
                  location: "home"
                }
              },
              {
                id: 7002,
                name: "Czechia",
                meta: {
                  location: "away"
                }
              }
            ]
          }
        ],
        provider: {
          id: "sportmonks",
          name: "Sportmonks"
        }
      }),
    /No local fixture match for provider fixture sportmonks:991001/
  );
});
