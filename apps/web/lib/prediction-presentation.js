export function buildOutcomePresentation({ homeName, awayName, probabilities }) {
  return [
    buildOutcome("home", homeName, probabilities.homeWin),
    buildOutcome("draw", "Draw", probabilities.draw),
    buildOutcome("away", awayName, probabilities.awayWin)
  ];
}

export function formatPercentagePointDelta(value, baseline) {
  const delta = Math.round((value - baseline) * 100);
  if (delta > 0) return `+${delta}pp`;
  if (delta < 0) return `${delta}pp`;
  return "0pp";
}

function buildOutcome(key, label, probability) {
  const percentage = probability * 100;
  return {
    key,
    label,
    percentLabel: `${Math.round(percentage)}%`,
    width: `${percentage}%`
  };
}
