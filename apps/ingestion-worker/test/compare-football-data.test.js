import assert from "node:assert/strict";
import test from "node:test";
import { buildReconciliationDiff } from "../src/cli/compare-football-data-core.js";

const canonicalFixtures = [
  { id: "A-2", kickoff_at: "2026-06-11T19:00:00Z", status: "final", home_goals: 2, away_goals: 0, home_team_id: "MEX", away_team_id: "RSA" },
  { id: "A-5", kickoff_at: "2026-06-18T16:00:00Z", status: "scheduled", home_goals: null, away_goals: null, home_team_id: "RSA", away_team_id: "CZE" }
];

const canonicalTeamNamesById = new Map([
  ["MEX", "Mexico"],
  ["RSA", "South Africa"],
  ["CZE", "Czechia"]
]);

test("matches a finished football-data.org match with agreeing score and status", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "537327", kickoffAt: "2026-06-11T19:00:00Z", status: "final", home: { name: "Mexico", goals: 2 }, away: { name: "South Africa", goals: 0 } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.deepEqual(diff, [
    { providerFixtureId: "537327", localFixtureId: "A-2", agrees: true, differences: [] }
  ]);
});

test("flags a score disagreement", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "537327", kickoffAt: "2026-06-11T19:00:00Z", status: "final", home: { name: "Mexico", goals: 3 }, away: { name: "South Africa", goals: 0 } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.equal(diff[0].agrees, false);
  assert.deepEqual(diff[0].differences, ["home_goals: local=2 football-data=3"]);
});

test("reports an unmatched football-data.org fixture", () => {
  const footballDataMatches = [
    { provider: "football-data", providerFixtureId: "999999", kickoffAt: "2099-01-01T00:00:00Z", status: "scheduled", home: { name: "Nowhere", goals: null }, away: { name: "Nobody", goals: null } }
  ];

  const diff = buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });

  assert.deepEqual(diff, [
    { providerFixtureId: "999999", localFixtureId: null, agrees: false, differences: ["no canonical fixture matched this kickoff/participants"] }
  ]);
});
