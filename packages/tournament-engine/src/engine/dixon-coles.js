export function computeLambda(attack, defense, { homeAdvantage = 0, applyHomeAdvantage = false } = {}) {
  return Math.exp(attack - defense + (applyHomeAdvantage ? homeAdvantage : 0));
}

export function poissonProbability(goals, lambda) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) {
    factorial *= value;
  }
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function tauAdjustment(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function scorelineProbability(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  return (
    tauAdjustment(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) *
    poissonProbability(homeGoals, lambdaHome) *
    poissonProbability(awayGoals, lambdaAway)
  );
}
