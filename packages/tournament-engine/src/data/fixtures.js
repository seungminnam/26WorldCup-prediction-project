import { groupFixtures } from "./canonical-schedule.js";

// The prediction engine intentionally consumes group-stage fixtures only.
export const fixtures = groupFixtures;

export function buildGroupFixtures() {
  return groupFixtures.map((fixture) => ({
    ...fixture,
    scorers: [...fixture.scorers]
  }));
}
