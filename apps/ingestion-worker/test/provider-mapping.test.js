import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProviderMappingPlan } from "../src/mapping/provider-mapping.js";

test("builds provider, team, and fixture mapping upsert rows", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/provider-mappings.sample.json", import.meta.url), "utf8")
  );

  const plan = buildProviderMappingPlan(raw, {
    syncedAt: "2026-06-17T04:15:00.000Z"
  });

  assert.deepEqual(plan.provider, {
    id: "sportmonks",
    name: "Sportmonks",
    base_url: "https://api.sportmonks.com",
    status: "evaluation",
    latest_sync_at: "2026-06-17T04:15:00.000Z",
    mapped_fixture_count: 1,
    notes: "Sanitized sample mapping payload for ingestion worker tests."
  });

  assert.deepEqual(plan.teamMappings, [
    {
      provider_id: "sportmonks",
      team_id: "KOR",
      provider_team_id: "7001",
      provider_name: "Korea Republic",
      provider_code: "KOR",
      last_synced_at: "2026-06-17T04:15:00.000Z"
    },
    {
      provider_id: "sportmonks",
      team_id: "CZE",
      provider_team_id: "7002",
      provider_name: "Czechia",
      provider_code: "CZE",
      last_synced_at: "2026-06-17T04:15:00.000Z"
    }
  ]);

  assert.deepEqual(plan.fixtureMappings, [
    {
      provider_id: "sportmonks",
      fixture_id: "A-2",
      provider_fixture_id: "991001",
      provider_season_id: "2026",
      provider_league_id: "world-cup-2026",
      last_payload_hash: "sample-hash-kor-cze",
      last_synced_at: "2026-06-17T04:15:00.000Z"
    }
  ]);
});

test("rejects duplicate provider team ids before writing mappings", () => {
  const payload = {
    provider: {
      id: "sportmonks",
      name: "Sportmonks"
    },
    teams: [
      {
        teamId: "KOR",
        providerTeamId: "7001"
      },
      {
        teamId: "JPN",
        providerTeamId: "7001"
      }
    ],
    fixtures: []
  };

  assert.throws(
    () => buildProviderMappingPlan(payload, { syncedAt: "2026-06-17T04:15:00.000Z" }),
    /Duplicate provider team id: sportmonks:7001/
  );
});
