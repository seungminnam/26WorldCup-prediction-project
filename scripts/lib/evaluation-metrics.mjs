const OUTCOMES = ["homeWin", "draw", "awayWin"];

export function accuracy(predictions) {
  const correct = predictions.filter((prediction) => {
    const best = OUTCOMES.reduce((a, b) => (prediction.probabilities[a] >= prediction.probabilities[b] ? a : b));
    return best === prediction.actual;
  }).length;
  return correct / predictions.length;
}

export function logLoss(predictions) {
  const total = predictions.reduce((sum, prediction) => {
    const probability = Math.max(prediction.probabilities[prediction.actual], 1e-15);
    return sum - Math.log(probability);
  }, 0);
  return total / predictions.length;
}

export function brierScore(predictions) {
  const total = predictions.reduce((sum, prediction) => {
    const squaredErrors = OUTCOMES.reduce((errorSum, outcome) => {
      const actualIndicator = outcome === prediction.actual ? 1 : 0;
      return errorSum + (prediction.probabilities[outcome] - actualIndicator) ** 2;
    }, 0);
    return sum + squaredErrors;
  }, 0);
  return total / predictions.length;
}
