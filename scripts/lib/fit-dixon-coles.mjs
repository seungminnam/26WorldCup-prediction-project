import { computeLambda, tauAdjustment } from "../../packages/tournament-engine/src/engine/dixon-coles.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeEffectiveMatchCounts(matches, teamIds, { xi, referenceDate }) {
  const counts = new Map(teamIds.map((id) => [id, 0]));

  for (const match of matches) {
    const weight = Math.exp((-xi * (referenceDate.getTime() - match.date.getTime())) / MILLISECONDS_PER_DAY);
    if (counts.has(match.homeTeamId)) counts.set(match.homeTeamId, counts.get(match.homeTeamId) + weight);
    if (counts.has(match.awayTeamId)) counts.set(match.awayTeamId, counts.get(match.awayTeamId) + weight);
  }

  return counts;
}

export function linearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function tauGradients(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) {
    const tau = tauAdjustment(0, 0, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: (-lambdaAway * rho) / tau, wrtLambdaAway: (-lambdaHome * rho) / tau, wrtRho: (-lambdaHome * lambdaAway) / tau };
  }
  if (homeGoals === 0 && awayGoals === 1) {
    const tau = tauAdjustment(0, 1, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: rho / tau, wrtLambdaAway: 0, wrtRho: lambdaHome / tau };
  }
  if (homeGoals === 1 && awayGoals === 0) {
    const tau = tauAdjustment(1, 0, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: 0, wrtLambdaAway: rho / tau, wrtRho: lambdaAway / tau };
  }
  if (homeGoals === 1 && awayGoals === 1) {
    const tau = tauAdjustment(1, 1, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: 0, wrtLambdaAway: 0, wrtRho: -1 / tau };
  }
  return { wrtLambdaHome: 0, wrtLambdaAway: 0, wrtRho: 0 };
}

export function fitDixonColes(matches, teamIds, { iterations = 300, learningRate = 0.1, l2 = 0.001, xi = 0.001, referenceDate } = {}) {
  const attack = new Map(teamIds.map((id) => [id, 0]));
  const defense = new Map(teamIds.map((id) => [id, 0]));
  let homeAdvantage = 0.2;
  let rho = -0.05;

  const weighted = matches.map((match) => ({
    ...match,
    weight: Math.exp((-xi * (referenceDate.getTime() - match.date.getTime())) / MILLISECONDS_PER_DAY)
  }));
  const totalWeight = weighted.reduce((sum, match) => sum + match.weight, 0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const attackGrad = new Map(teamIds.map((id) => [id, 0]));
    const defenseGrad = new Map(teamIds.map((id) => [id, 0]));
    let homeAdvantageGrad = 0;
    let rhoGrad = 0;

    for (const match of weighted) {
      const { homeTeamId: h, awayTeamId: a, homeGoals: x, awayGoals: y, isNeutralVenue, weight } = match;
      const lambdaHome = computeLambda(attack.get(h), defense.get(a), { homeAdvantage, applyHomeAdvantage: !isNeutralVenue });
      const lambdaAway = computeLambda(attack.get(a), defense.get(h), { applyHomeAdvantage: false });
      const tauGrad = tauGradients(x, y, lambdaHome, lambdaAway, rho);

      const gradWrtLambdaHome = (x / lambdaHome - 1) + tauGrad.wrtLambdaHome;
      const gradWrtLambdaAway = (y / lambdaAway - 1) + tauGrad.wrtLambdaAway;

      attackGrad.set(h, attackGrad.get(h) + weight * gradWrtLambdaHome * lambdaHome);
      defenseGrad.set(a, defenseGrad.get(a) + weight * gradWrtLambdaHome * -lambdaHome);
      attackGrad.set(a, attackGrad.get(a) + weight * gradWrtLambdaAway * lambdaAway);
      defenseGrad.set(h, defenseGrad.get(h) + weight * gradWrtLambdaAway * -lambdaAway);
      if (!isNeutralVenue) {
        homeAdvantageGrad += weight * gradWrtLambdaHome * lambdaHome;
      }
      rhoGrad += weight * tauGrad.wrtRho;
    }

    for (const id of teamIds) {
      const meanAttackGrad = attackGrad.get(id) / totalWeight;
      const meanDefenseGrad = defenseGrad.get(id) / totalWeight;
      attack.set(id, attack.get(id) + learningRate * (meanAttackGrad - 2 * l2 * attack.get(id)));
      defense.set(id, defense.get(id) + learningRate * (meanDefenseGrad - 2 * l2 * defense.get(id)));
    }
    homeAdvantage += learningRate * (homeAdvantageGrad / totalWeight);
    rho += learningRate * (rhoGrad / totalWeight);
  }

  return { attack, defense, homeAdvantage, rho };
}
