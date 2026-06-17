import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseWriter } from "../src/storage/supabase-writer.js";

test("applies provider mapping plan with deterministic upsert order", async () => {
  const calls = [];
  const writer = createSupabaseWriter({
    client: createRecordingClient(calls)
  });

  await writer.applyProviderMappingPlan({
    provider: {
      id: "sportmonks",
      name: "Sportmonks",
      base_url: "https://api.sportmonks.com",
      status: "evaluation",
      latest_sync_at: "2026-06-17T04:15:00.000Z",
      mapped_fixture_count: 1,
      notes: "Sample"
    },
    teamMappings: [
      {
        provider_id: "sportmonks",
        team_id: "KOR",
        provider_team_id: "7001",
        provider_name: "Korea Republic",
        provider_code: "KOR",
        last_synced_at: "2026-06-17T04:15:00.000Z"
      }
    ],
    fixtureMappings: [
      {
        provider_id: "sportmonks",
        fixture_id: "A-2",
        provider_fixture_id: "991001",
        provider_season_id: "2026",
        provider_league_id: "world-cup-2026",
        last_payload_hash: "sample-hash-kor-cze",
        last_synced_at: "2026-06-17T04:15:00.000Z"
      }
    ]
  });

  assert.deepEqual(calls, [
    {
      table: "data_providers",
      rows: {
        id: "sportmonks",
        name: "Sportmonks",
        base_url: "https://api.sportmonks.com",
        status: "evaluation",
        latest_sync_at: "2026-06-17T04:15:00.000Z",
        mapped_fixture_count: 1,
        notes: "Sample"
      },
      options: {
        onConflict: "id"
      }
    },
    {
      table: "provider_team_mappings",
      rows: [
        {
          provider_id: "sportmonks",
          team_id: "KOR",
          provider_team_id: "7001",
          provider_name: "Korea Republic",
          provider_code: "KOR",
          last_synced_at: "2026-06-17T04:15:00.000Z"
        }
      ],
      options: {
        onConflict: "provider_id,team_id"
      }
    },
    {
      table: "provider_fixture_mappings",
      rows: [
        {
          provider_id: "sportmonks",
          fixture_id: "A-2",
          provider_fixture_id: "991001",
          provider_season_id: "2026",
          provider_league_id: "world-cup-2026",
          last_payload_hash: "sample-hash-kor-cze",
          last_synced_at: "2026-06-17T04:15:00.000Z"
        }
      ],
      options: {
        onConflict: "provider_id,fixture_id"
      }
    }
  ]);
});

function createRecordingClient(calls) {
  return {
    from(table) {
      return {
        async upsert(rows, options) {
          calls.push({ table, rows, options });
          return { error: null };
        }
      };
    }
  };
}
