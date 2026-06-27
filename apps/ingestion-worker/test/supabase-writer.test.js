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

test("loads provider fixture and team mappings", async () => {
  const queries = [];
  const writer = createSupabaseWriter({
    client: {
      from(table) {
        return {
          select(columns) {
            return {
              async eq(column, value) {
                queries.push({ table, columns, column, value });
                if (table === "provider_fixture_mappings") {
                  return {
                    data: [{ provider_fixture_id: "1199001", fixture_id: "A-2" }],
                    error: null
                  };
                }
                return {
                  data: [
                    { provider_team_id: "7001", team_id: "KOR" },
                    { provider_team_id: "7002", team_id: "CZE" }
                  ],
                  error: null
                };
              }
            };
          }
        };
      }
    }
  });

  const mappings = await writer.loadProviderMappings("api-football");

  assert.deepEqual(queries, [
    {
      table: "provider_fixture_mappings",
      columns: "provider_fixture_id,fixture_id",
      column: "provider_id",
      value: "api-football"
    },
    {
      table: "provider_team_mappings",
      columns: "provider_team_id,team_id",
      column: "provider_id",
      value: "api-football"
    }
  ]);
  assert.deepEqual(Array.from(mappings.fixtureByProviderId), [["1199001", "A-2"]]);
  assert.deepEqual(Array.from(mappings.teamByProviderId), [
    ["7001", "KOR"],
    ["7002", "CZE"]
  ]);
});

test("rejects provider mapping query errors", async () => {
  const expectedError = new Error("mapping query failed");
  const writer = createSupabaseWriter({
    client: {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: null, error: expectedError };
              }
            };
          }
        };
      }
    }
  });

  await assert.rejects(() => writer.loadProviderMappings("api-football"), expectedError);
});

test("records ingestion outcomes through the service-role RPC", async () => {
  const calls = [];
  const writer = createSupabaseWriter({
    client: {
      async rpc(name, params) {
        calls.push({ name, params });
        return { data: "run-id", error: null };
      }
    }
  });

  await writer.recordIngestionRun({
    source: "api-football",
    status: "completed",
    rowsSeen: 1,
    rowsChanged: 1,
    errorMessage: null,
    metadata: { remaining: 87 }
  });

  assert.deepEqual(calls, [
    {
      name: "record_ingestion_run",
      params: {
        p_source: "api-football",
        p_status: "completed",
        p_rows_seen: 1,
        p_rows_changed: 1,
        p_error_message: null,
        p_metadata: { remaining: 87 }
      }
    }
  ]);
});

test("loadCanonicalFixtures reads fixture cards for reconciliation", async () => {
  const rows = [
    { id: "A-2", kickoff_at: "2026-06-11T19:00:00Z", status: "final", home_goals: 2, away_goals: 0, home_team_id: "MEX", away_team_id: "RSA" }
  ];
  const client = {
    from(table) {
      assert.equal(table, "fixture_cards");
      return {
        select() {
          return Promise.resolve({ data: rows, error: null });
        }
      };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadCanonicalFixtures();
  assert.deepEqual(result, rows);
});

test("loadTeamNamesById reads the teams table as a name lookup", async () => {
  const client = {
    from(table) {
      assert.equal(table, "teams");
      return { select: () => Promise.resolve({ data: [{ id: "MEX", name: "Mexico" }], error: null }) };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadTeamNamesById();
  assert.deepEqual(result, new Map([["MEX", "Mexico"]]));
});

test("loads provider fixture and team mappings for result sync", async () => {
  const writer = createSupabaseWriter({
    client: createMappingClient({
      provider_fixture_mappings: [{ provider_fixture_id: "760415", fixture_id: "A-1" }],
      provider_team_mappings: [{ provider_team_id: "203", team_id: "MEX" }]
    })
  });

  const mappings = await writer.loadProviderMappings("espn");

  assert.equal(mappings.fixtureByProviderId.get("760415"), "A-1");
  assert.equal(mappings.teamByProviderId.get("203"), "MEX");
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

test("loadAllFixturesAndTeams reads the full fixture and team rows needed for knockout slot resolution", async () => {
  const fixtureRows = [
    {
      id: "M-73",
      match_number: 73,
      group_code: null,
      stage: "round_of_32",
      home_team_id: null,
      away_team_id: null,
      home_slot: "2A",
      away_slot: "2B",
      home_goals: null,
      away_goals: null,
      winner_team_id: null
    }
  ];
  const teamRows = [{ id: "MEX", group_code: "A", rating: 1715, fifa_ranking: 14 }];
  const client = {
    from(table) {
      if (table === "fixture_cards") {
        return { select: () => Promise.resolve({ data: fixtureRows, error: null }) };
      }
      if (table === "teams") {
        return { select: () => Promise.resolve({ data: teamRows, error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadAllFixturesAndTeams();

  assert.deepEqual(result.fixtureRows, fixtureRows);
  assert.deepEqual(result.teamRows, teamRows);
});

test("applyResolveKnockoutSlotsPlan updates a fixture's resolved team IDs", async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "fixtures");
      return {
        update(values) {
          return {
            eq(column, value) {
              calls.push({ values, column, value });
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.applyResolveKnockoutSlotsPlan({ id: "M-73", homeTeamId: "KOR", awayTeamId: "CAN" });

  assert.deepEqual(calls, [{ values: { home_team_id: "KOR", away_team_id: "CAN" }, column: "id", value: "M-73" }]);
  assert.deepEqual(result, { fixtureId: "M-73", homeTeamId: "KOR", awayTeamId: "CAN" });
});

function createMappingClient(rowsByTable) {
  return {
    from(table) {
      return {
        select() {
          return this;
        },
        async eq() {
          return { data: rowsByTable[table], error: null };
        }
      };
    }
  };
}
