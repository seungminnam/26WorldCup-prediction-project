export function buildGroupTable(teams, matches) {
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        group: team.group,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        rating: team.rating
      }
    ])
  );

  for (const match of matches) {
    if (!Number.isFinite(match.homeGoals) || !Number.isFinite(match.awayGoals)) {
      continue;
    }

    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()];
}

export function compareRows(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.rating - a.rating ||
    a.teamId.localeCompare(b.teamId)
  );
}

export function rankGroup(rows) {
  return [...rows].sort(compareRows);
}

export function rankAllGroups(teamList, matches) {
  const groups = [...new Set(teamList.map((team) => team.group))].sort();

  return groups.map((group) => {
    const groupTeams = teamList.filter((team) => team.group === group);
    const groupMatches = matches.filter((match) => match.group === group);
    return rankGroup(buildGroupTable(groupTeams, groupMatches));
  });
}
