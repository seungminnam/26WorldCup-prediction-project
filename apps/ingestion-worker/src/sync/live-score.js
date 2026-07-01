export function buildLiveScoreUpsertPlan(normalized, mappings) {
  const fixtureId = mappings.fixtureByProviderId.get(normalized.providerFixtureId);

  if (!fixtureId) {
    throw new Error(`No local fixture mapping for ${normalized.provider}:${normalized.providerFixtureId}`);
  }

  const homeTeamId = requireTeamMapping(normalized.home.providerTeamId, normalized.provider, mappings);
  const awayTeamId = requireTeamMapping(normalized.away.providerTeamId, normalized.provider, mappings);

  return {
    fixture: {
      id: fixtureId,
      status: normalized.status,
      home_goals: normalized.home.goals,
      away_goals: normalized.away.goals,
      home_penalties: normalized.home.penalties ?? null,
      away_penalties: normalized.away.penalties ?? null,
      winner_team_id: determineWinnerTeamId(normalized, homeTeamId, awayTeamId),
      elapsed_minutes: normalized.elapsed ?? null,
      result_verified_at: null,
      source: normalized.provider
    },
    events: normalized.events.map((event) => {
      const teamId = mappings.teamByProviderId.get(event.providerTeamId);

      if (!teamId) {
        throw new Error(`No local team mapping for ${normalized.provider}:${event.providerTeamId}`);
      }

      return {
        fixture_id: fixtureId,
        team_id: teamId,
        player_name: event.playerName,
        assist_player_name: event.assistPlayerName ?? null,
        minute: event.minute,
        stoppage_minute: event.stoppageMinute,
        event_type: event.eventType,
        source_event_id: event.providerEventId,
        is_confirmed: true,
        source: normalized.provider,
        source_url: null
      };
    })
  };
}

function determineWinnerTeamId(normalized, homeTeamId, awayTeamId) {
  if (normalized.status !== "final") return null;
  if (normalized.home.goals > normalized.away.goals) return homeTeamId;
  if (normalized.away.goals > normalized.home.goals) return awayTeamId;

  if (normalized.home.penalties > normalized.away.penalties) return homeTeamId;
  if (normalized.away.penalties > normalized.home.penalties) return awayTeamId;
  return null;
}

function requireTeamMapping(providerTeamId, provider, mappings) {
  const teamId = mappings.teamByProviderId.get(providerTeamId);
  if (!teamId) {
    throw new Error(`No local team mapping for ${provider}:${providerTeamId}`);
  }
  return teamId;
}
