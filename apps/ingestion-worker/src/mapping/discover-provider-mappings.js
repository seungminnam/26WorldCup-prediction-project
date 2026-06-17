export function discoverProviderMappings({ local, providerFixtures, provider }) {
  const providerId = requireText(provider.id, "provider.id");
  const localTeamsById = new Map((local.teams ?? []).map((team) => [team.id, team]));
  const localFixtures = local.fixtures ?? [];
  const teamMappingsByTeamId = new Map();
  const fixtureMappings = [];

  for (const providerFixture of providerFixtures) {
    const providerParticipants = getProviderParticipants(providerFixture);
    const localFixture = findLocalFixture({
      localFixtures,
      localTeamsById,
      providerFixture,
      providerParticipants
    });

    if (!localFixture) {
      throw new Error(`No local fixture match for provider fixture ${providerId}:${providerFixture.id}`);
    }

    const homeParticipant = providerParticipants.home;
    const awayParticipant = providerParticipants.away;

    addTeamMapping(teamMappingsByTeamId, {
      teamId: localFixture.homeTeamId,
      providerTeamId: String(homeParticipant.id),
      providerName: homeParticipant.name,
      providerCode: null
    });
    addTeamMapping(teamMappingsByTeamId, {
      teamId: localFixture.awayTeamId,
      providerTeamId: String(awayParticipant.id),
      providerName: awayParticipant.name,
      providerCode: null
    });

    fixtureMappings.push({
      fixtureId: localFixture.id,
      providerFixtureId: String(providerFixture.id),
      providerSeasonId: optionalString(providerFixture.season_id),
      providerLeagueId: optionalString(providerFixture.league_id),
      lastPayloadHash: buildFixtureHash(providerId, providerFixture, homeParticipant, awayParticipant)
    });
  }

  return {
    provider: {
      id: providerId,
      name: requireText(provider.name, "provider.name"),
      baseUrl: optionalString(provider.baseUrl),
      status: optionalString(provider.status) ?? "evaluation",
      notes: "Discovered from sanitized provider fixture payload."
    },
    teams: Array.from(teamMappingsByTeamId.values()),
    fixtures: fixtureMappings.sort((left, right) => left.fixtureId.localeCompare(right.fixtureId))
  };
}

function findLocalFixture({ localFixtures, localTeamsById, providerFixture, providerParticipants }) {
  return localFixtures.find((fixture) => {
    const homeTeam = localTeamsById.get(fixture.homeTeamId);
    const awayTeam = localTeamsById.get(fixture.awayTeamId);

    return (
      normalizeInstant(fixture.kickoffAt) === normalizeInstant(providerFixture.starting_at) &&
      normalizeName(homeTeam?.name) === normalizeName(providerParticipants.home.name) &&
      normalizeName(awayTeam?.name) === normalizeName(providerParticipants.away.name)
    );
  });
}

function getProviderParticipants(providerFixture) {
  const participants = Array.isArray(providerFixture.participants) ? providerFixture.participants : [];
  const home = participants.find((participant) => participant.meta?.location === "home");
  const away = participants.find((participant) => participant.meta?.location === "away");

  if (!home || !away) {
    throw new Error(`Provider fixture ${providerFixture.id} is missing home or away participant`);
  }

  return { home, away };
}

function addTeamMapping(mappings, mapping) {
  const existing = mappings.get(mapping.teamId);
  if (existing && existing.providerTeamId !== mapping.providerTeamId) {
    throw new Error(`Conflicting provider team mapping for local team ${mapping.teamId}`);
  }
  mappings.set(mapping.teamId, mapping);
}

function buildFixtureHash(providerId, providerFixture, homeParticipant, awayParticipant) {
  return [
    providerId,
    providerFixture.id,
    providerFixture.starting_at,
    homeParticipant.id,
    awayParticipant.id
  ].map(String).join(":");
}

function normalizeInstant(value) {
  return new Date(value).toISOString();
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}
