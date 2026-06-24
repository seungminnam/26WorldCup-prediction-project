import { computeLambda, scorelineProbability } from "./dixon-coles.js";
import { modelConstants, teamStrength } from "../data/team-strength.js";

const PREDICTION_MODEL = Object.freeze({
  id: "dixon-coles-v1",
  label: "Dixon-Coles (fitted on martj42/international_results)",
  trained: true,
  trainedAt: modelConstants.trainedAt,
  dataSource: modelConstants.dataSource
});

const HOST_NATION_IDS = new Set(["MEX", "CAN", "USA"]);

export function isHostNationFixture(teamId) {
  return HOST_NATION_IDS.has(teamId);
}

export function expectedGoals(
  attackingTeam,
  defendingTeam,
  { applyHomeAdvantage = false, strength = teamStrength, advantage = modelConstants.homeAdvantage } = {}
) {
  // A value placed directly on the team object wins over the strength table lookup. No real
  // team data ever carries .attack/.defense (only synthetic test fixtures, e.g. bracket.test.js's
  // placeholder teams, which don't exist in the real 48-team table); this exists purely so tests
  // can stub strength without needing a real, recognized team id.
  const attack = attackingTeam.attack ?? strength[attackingTeam.id]?.attack;
  const defense = defendingTeam.defense ?? strength[defendingTeam.id]?.defense;
  if (!Number.isFinite(attack) || !Number.isFinite(defense)) {
    throw new TypeError(`expectedGoals requires fitted team-strength data for "${attackingTeam.id}" and "${defendingTeam.id}"`);
  }
  return computeLambda(attack, defense, { homeAdvantage: advantage, applyHomeAdvantage });
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

export function simulateScore(
  homeTeam,
  awayTeam,
  random = Math.random,
  { isNeutralVenue = true, strength = teamStrength, advantage = modelConstants.homeAdvantage } = {}
) {
  return {
    homeGoals: samplePoisson(expectedGoals(homeTeam, awayTeam, { applyHomeAdvantage: !isNeutralVenue, strength, advantage }), random),
    awayGoals: samplePoisson(expectedGoals(awayTeam, homeTeam, { applyHomeAdvantage: false, strength, advantage }), random)
  };
}

function buildScorelineGrid(
  homeTeam,
  awayTeam,
  {
    maxGoals = 10,
    isNeutralVenue = true,
    strength = teamStrength,
    advantage = modelConstants.homeAdvantage,
    rho = modelConstants.rho
  } = {}
) {
  const homeLambda = expectedGoals(homeTeam, awayTeam, { applyHomeAdvantage: !isNeutralVenue, strength, advantage });
  const awayLambda = expectedGoals(awayTeam, homeTeam, { applyHomeAdvantage: false, strength, advantage });
  const rawScorelines = [];
  let capturedMass = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = scorelineProbability(homeGoals, awayGoals, homeLambda, awayLambda, rho);
      capturedMass += probability;
      rawScorelines.push({ homeGoals, awayGoals, probability });
    }
  }

  const normalized = rawScorelines
    .map((scoreline) => ({ ...scoreline, probability: scoreline.probability / capturedMass }))
    .sort(
      (left, right) =>
        right.probability - left.probability || left.homeGoals - right.homeGoals || left.awayGoals - right.awayGoals
    );

  const probabilities = normalized.reduce(
    (result, scoreline) => {
      if (scoreline.homeGoals > scoreline.awayGoals) result.homeWin += scoreline.probability;
      else if (scoreline.homeGoals < scoreline.awayGoals) result.awayWin += scoreline.probability;
      else result.draw += scoreline.probability;
      return result;
    },
    { homeWin: 0, draw: 0, awayWin: 0 }
  );

  return { scorelines: normalized, probabilities };
}

export function predictMatch(homeTeam, awayTeam, options = {}) {
  const {
    maxGoals = 10,
    scorelineCount = 3,
    isNeutralVenue = true,
    strength = teamStrength,
    advantage = modelConstants.homeAdvantage,
    rho = modelConstants.rho
  } = options;
  const { scorelines: normalized, probabilities } = buildScorelineGrid(homeTeam, awayTeam, {
    maxGoals,
    isNeutralVenue,
    strength,
    advantage,
    rho
  });
  const scorelines = normalized.slice(0, scorelineCount);

  return {
    model: PREDICTION_MODEL,
    probabilities,
    mostLikelyScore: scorelines[0],
    scorelines
  };
}

export function winProbability(teamA, teamB, options = {}) {
  const {
    isNeutralVenue = true,
    strength = teamStrength,
    advantage = modelConstants.homeAdvantage,
    rho = modelConstants.rho
  } = options;
  const { probabilities } = buildScorelineGrid(teamA, teamB, { isNeutralVenue, strength, advantage, rho });
  return probabilities.homeWin + 0.5 * probabilities.draw;
}

export function simulateGroupMatch(match, teamsById, random = Math.random) {
  if (Number.isFinite(match.homeGoals) && Number.isFinite(match.awayGoals)) {
    return { ...match };
  }

  const isNeutralVenue = !isHostNationFixture(match.homeTeamId);
  const score = simulateScore(teamsById[match.homeTeamId], teamsById[match.awayTeamId], random, { isNeutralVenue });
  return { ...match, ...score };
}

export function pickKnockoutWinner(teamA, teamB, random = Math.random) {
  const probability = winProbability(teamA, teamB);
  return random() <= probability ? teamA.id : teamB.id;
}
