export function buildLiveScoreUpsertPlan(normalized, mappings) {
  const fixtureId = mappings.fixtureByProviderId.get(normalized.providerFixtureId);

  if (!fixtureId) {
    throw new Error(`No local fixture mapping for ${normalized.provider}:${normalized.providerFixtureId}`);
  }

  return {
    fixture: {
      id: fixtureId,
      status: normalized.status,
      home_goals: normalized.home.goals,
      away_goals: normalized.away.goals,
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
