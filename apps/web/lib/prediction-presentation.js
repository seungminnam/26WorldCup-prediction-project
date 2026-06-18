export function buildOutcomePresentation({ homeName, awayName, probabilities }) {
  return [
    buildOutcome("home", homeName, probabilities.homeWin),
    buildOutcome("draw", "Draw", probabilities.draw),
    buildOutcome("away", awayName, probabilities.awayWin)
  ];
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
