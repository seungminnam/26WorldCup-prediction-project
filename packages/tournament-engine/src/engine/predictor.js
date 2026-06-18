const PREDICTION_MODEL = Object.freeze({
  id: "rating-poisson-v1",
  label: "Rating + Poisson baseline",
  trained: false
});

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

export function predictMatch(homeTeam, awayTeam, { maxGoals = 10, scorelineCount = 3 } = {}) {
  if (!Number.isFinite(homeTeam?.rating) || !Number.isFinite(awayTeam?.rating)) {
    throw new TypeError("predictMatch requires finite team ratings");
  }

  const homeLambda = expectedGoals(homeTeam, awayTeam);
  const awayLambda = expectedGoals(awayTeam, homeTeam);
  const rawScorelines = [];
  let capturedMass = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = poissonProbability(homeGoals, homeLambda) * poissonProbability(awayGoals, awayLambda);
      capturedMass += probability;
      rawScorelines.push({ homeGoals, awayGoals, probability });
    }
  }

  const normalized = rawScorelines
    .map((scoreline) => ({
      ...scoreline,
      probability: scoreline.probability / capturedMass
    }))
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.homeGoals - right.homeGoals ||
        left.awayGoals - right.awayGoals
    );

  const probabilities = normalized.reduce(
    (result, scoreline) => {
      if (scoreline.homeGoals > scoreline.awayGoals) {
        result.homeWin += scoreline.probability;
      } else if (scoreline.homeGoals < scoreline.awayGoals) {
        result.awayWin += scoreline.probability;
      } else {
        result.draw += scoreline.probability;
      }
      return result;
    },
    { homeWin: 0, draw: 0, awayWin: 0 }
  );

  const scorelines = normalized.slice(0, scorelineCount);
  return {
    model: PREDICTION_MODEL,
    probabilities,
    mostLikelyScore: scorelines[0],
    scorelines
  };
}

function poissonProbability(goals, lambda) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) {
    factorial *= value;
  }
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
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
