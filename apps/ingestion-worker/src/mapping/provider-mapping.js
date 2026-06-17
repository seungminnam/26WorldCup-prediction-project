const DEFAULT_PROVIDER_STATUS = "evaluation";

export function buildProviderMappingPlan(payload, { syncedAt = new Date().toISOString() } = {}) {
  const providerId = requireText(payload.provider?.id, "provider.id");

  assertNoDuplicates(
    payload.teams ?? [],
    (team) => team.providerTeamId,
    (providerTeamId) => `Duplicate provider team id: ${providerId}:${providerTeamId}`
  );
  assertNoDuplicates(
    payload.fixtures ?? [],
    (fixture) => fixture.providerFixtureId,
    (providerFixtureId) => `Duplicate provider fixture id: ${providerId}:${providerFixtureId}`
  );

  const fixtureMappings = (payload.fixtures ?? []).map((fixture) => ({
    provider_id: providerId,
    fixture_id: requireText(fixture.fixtureId, "fixture.fixtureId"),
    provider_fixture_id: requireText(fixture.providerFixtureId, "fixture.providerFixtureId"),
    provider_season_id: optionalText(fixture.providerSeasonId),
    provider_league_id: optionalText(fixture.providerLeagueId),
    last_payload_hash: optionalText(fixture.lastPayloadHash),
    last_synced_at: syncedAt
  }));

  return {
    provider: {
      id: providerId,
      name: requireText(payload.provider?.name, "provider.name"),
      base_url: optionalText(payload.provider?.baseUrl),
      status: optionalText(payload.provider?.status) ?? DEFAULT_PROVIDER_STATUS,
      latest_sync_at: syncedAt,
      mapped_fixture_count: fixtureMappings.length,
      notes: optionalText(payload.provider?.notes)
    },
    teamMappings: (payload.teams ?? []).map((team) => ({
      provider_id: providerId,
      team_id: requireText(team.teamId, "team.teamId"),
      provider_team_id: requireText(team.providerTeamId, "team.providerTeamId"),
      provider_name: optionalText(team.providerName),
      provider_code: optionalText(team.providerCode),
      last_synced_at: syncedAt
    })),
    fixtureMappings
  };
}

function assertNoDuplicates(rows, getValue, makeMessage) {
  const seen = new Set();

  for (const row of rows) {
    const value = requireText(getValue(row), "duplicate check value");
    if (seen.has(value)) {
      throw new Error(makeMessage(value));
    }
    seen.add(value);
  }
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function optionalText(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}
