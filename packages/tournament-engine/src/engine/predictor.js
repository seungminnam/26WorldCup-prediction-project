export function winProbability(teamA, teamB) {
  return 1 / (1 + 10 ** ((teamB.rating - teamA.rating) / 400));
}

export function expectedGoals(teamA, teamB) {
  const diff = teamA.rating - teamB.rating;
  const attackBoost = Math.max(-0.85, Math.min(0.85, diff / 450));
  return Math.max(0.25, 1.25 + attackBoost);
}

export function samplePoisson(lambda, random = Math.random) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count += 1;
    product *= random();
  } while (product > limit);

  return count - 1;
}

export function simulateScore(homeTeam, awayTeam, random = Math.random) {
  return {
    homeGoals: samplePoisson(expectedGoals(homeTeam, awayTeam), random),
    awayGoals: samplePoisson(expectedGoals(awayTeam, homeTeam), random)
  };
}

export function simulateGroupMatch(match, teamsById, random = Math.random) {
  if (Number.isFinite(match.homeGoals) && Number.isFinite(match.awayGoals)) {
    return { ...match };
  }

  const score = simulateScore(teamsById[match.homeTeamId], teamsById[match.awayTeamId], random);
  return { ...match, ...score };
}

export function pickKnockoutWinner(teamA, teamB, random = Math.random) {
  const probability = winProbability(teamA, teamB);
  return random() <= probability ? teamA.id : teamB.id;
}
