const scoreBearingStatuses = new Set(["Live", "FT", "Result pending"]);

export function shouldShowPreMatchPrediction(status) {
  return status === "Upcoming";
}

export function displayFixtureScore(status, goals) {
  return scoreBearingStatuses.has(status) && typeof goals === "number" ? goals : "-";
}

export function formatMatchMinute(event) {
  const stoppageMinute = Number(event.stoppageMinute ?? 0);
  return stoppageMinute > 0 ? `${event.minute}+${stoppageMinute}'` : `${event.minute}'`;
}

export function computeCompletedGroups(fixtures) {
  const totalByGroup = new Map();
  const completedByGroup = new Map();

  for (const fixture of fixtures) {
    if (!fixture.group) continue;
    totalByGroup.set(fixture.group, (totalByGroup.get(fixture.group) ?? 0) + 1);
    const isComplete =
      fixture.status === "FT" && Number.isFinite(fixture.homeGoals) && Number.isFinite(fixture.awayGoals);
    if (isComplete) {
      completedByGroup.set(fixture.group, (completedByGroup.get(fixture.group) ?? 0) + 1);
    }
  }

  const completedGroups = new Set();
  for (const [group, total] of totalByGroup) {
    if (total > 0 && completedByGroup.get(group) === total) {
      completedGroups.add(group);
    }
  }
  return completedGroups;
}
