const scoreBearingStatuses = new Set(["Live", "FT", "Result pending"]);

export function shouldShowPreMatchPrediction(status) {
  return status === "Upcoming";
}

export function displayFixtureScore(status, goals) {
  return scoreBearingStatuses.has(status) && typeof goals === "number" ? goals : "-";
}
