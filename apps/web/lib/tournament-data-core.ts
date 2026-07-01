export function mapFixtureRows(rows: any[], eventRows: any[]) {
  const eventsByFixture = eventRows
    .filter((row) => row.event_type === "goal" || row.event_type === "own_goal" || row.event_type === "penalty_goal")
    .reduce<Record<string, any[]>>((accumulator, row) => {
      if (!row.team_id) return accumulator;
      accumulator[row.fixture_id] ??= [];
      accumulator[row.fixture_id].push({
        teamId: row.team_id,
        player: row.player_name,
        minute: row.minute,
        eventType: row.event_type,
        ...(typeof row.stoppage_minute === "number" && row.stoppage_minute > 0
          ? { stoppageMinute: row.stoppage_minute }
          : {})
      });
      return accumulator;
    }, {});

  const shootoutEventsByFixture = eventRows
    .filter((row) => row.event_type === "penalty_goal" || row.event_type === "penalty_miss")
    .reduce<Record<string, any[]>>((accumulator, row) => {
      if (!row.team_id || row.minute < 120) return accumulator;
      accumulator[row.fixture_id] ??= [];
      accumulator[row.fixture_id].push({
        teamId: row.team_id,
        player: row.player_name,
        minute: row.minute,
        eventType: row.event_type,
        ...(typeof row.stoppage_minute === "number" && row.stoppage_minute > 0
          ? { stoppageMinute: row.stoppage_minute }
          : {})
      });
      return accumulator;
    }, {});

  const cardsByFixture = eventRows
    .filter((row) => row.event_type === "yellow_card" || row.event_type === "red_card")
    .reduce<Record<string, any[]>>((accumulator, row) => {
      if (!row.team_id) return accumulator;
      accumulator[row.fixture_id] ??= [];
      accumulator[row.fixture_id].push({
        teamId: row.team_id,
        player: row.player_name,
        minute: row.minute,
        eventType: row.event_type
      });
      return accumulator;
    }, {});

  return rows.map((row) => ({
    id: row.id,
    matchNumber: row.match_number,
    stage: row.stage,
    group: row.group_code,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeSlot: row.home_slot ?? row.home_team_id,
    awaySlot: row.away_slot ?? row.away_team_id,
    kickoff: row.kickoff_at,
    venue: row.venue_name ?? "TBD",
    hostCity: row.venue_city ?? undefined,
    status: mapStatus(row.status),
    ...(typeof row.home_goals === "number" ? { homeGoals: row.home_goals } : {}),
    ...(typeof row.away_goals === "number" ? { awayGoals: row.away_goals } : {}),
    ...(typeof row.home_penalties === "number" ? { homePenalties: row.home_penalties } : {}),
    ...(typeof row.away_penalties === "number" ? { awayPenalties: row.away_penalties } : {}),
    ...(typeof row.elapsed_minutes === "number" ? { elapsedMinutes: row.elapsed_minutes } : {}),
    scorers: eventsByFixture[row.id] ?? [],
    shootoutEvents:
      typeof row.home_penalties === "number" && typeof row.away_penalties === "number"
        ? shootoutEventsByFixture[row.id] ?? []
        : [],
    cards: cardsByFixture[row.id] ?? []
  }));
}

function mapStatus(status: string) {
  if (status === "final") return "FT";
  if (status === "result_pending") return "Result pending";
  if (status === "live") return "Live";
  if (status === "postponed") return "Postponed";
  return "Upcoming";
}
