import assert from "node:assert/strict";
import test from "node:test";

import { loadCompetitiveMatches, TEAM_NAME_TO_ID } from "./historical-results.mjs";

const sampleCsv = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
1950-07-16,Brazil,Uruguay,1,2,FIFA World Cup,Rio de Janeiro,Brazil,FALSE
1990-01-01,France,England,2,2,Friendly,Paris,France,FALSE
2022-12-18,Argentina,France,3,3,FIFA World Cup,Lusail,Qatar,TRUE
2026-06-15,Mexico,South Africa,2,0,FIFA World Cup,Mexico City,Mexico,FALSE
2026-06-20,Korea Republic,Czechia,NA,NA,FIFA World Cup,Houston,United States,TRUE
2019-09-01,Atlantis,Wakanda,1,0,UEFA Euro qualification,Nowhere,Atlantis,FALSE
`;

test("excludes friendlies", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.ok(!matches.some((match) => match.homeTeamId === "FRA" && match.awayTeamId === "ENG"));
});

test("excludes every 2026 FIFA World Cup row, played or not", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.ok(!matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"));
  assert.ok(!matches.some((match) => match.homeTeamId === "KOR"));
});

test("keeps real historical competitive matches and maps team names to IDs", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  const final1950 = matches.find((match) => match.homeTeamId === "BRA" && match.awayTeamId === "URU");
  assert.ok(final1950);
  assert.equal(final1950.homeGoals, 1);
  assert.equal(final1950.awayGoals, 2);
  assert.equal(final1950.isNeutralVenue, false);

  const final2022 = matches.find((match) => match.homeTeamId === "ARG" && match.awayTeamId === "FRA");
  assert.equal(final2022.isNeutralVenue, true);
});

test("keeps competitive matches between teams outside the 48-team mapping table, using their raw dataset name as the ID", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  const nonWorldCupMatch = matches.find((match) => match.homeTeamId === "Atlantis" && match.awayTeamId === "Wakanda");
  assert.ok(
    nonWorldCupMatch,
    "a competitive match between two teams that never qualified for the 2026 World Cup must still be kept -- the fit needs the full historical network, not just intra-48-team matches"
  );
  assert.equal(nonWorldCupMatch.homeGoals, 1);
});

test("loadCompetitiveMatches keeps exactly the rows that are competitive, played, and not part of the 2026 World Cup", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.equal(matches.length, 3);
});

test("parses quoted city fields containing a comma without shifting later columns", () => {
  // neutral is deliberately TRUE here (not the real row's FALSE): if a column-shift bug
  // reintroduces itself, `neutral` would be read from the `country` column ("United States"),
  // which evaluates to `false` either way -- using TRUE is what actually makes this test fail
  // under the bug instead of passing by coincidence.
  const csvWithQuotedComma = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
1977-10-06,United States,China,1,1,FIFA World Cup qualification,"Washington, D.C.",United States,TRUE
`;
  const matches = loadCompetitiveMatches(csvWithQuotedComma);
  const match = matches.find((m) => m.homeTeamId === "USA");
  assert.ok(match, "the match should be kept (not dropped) despite the quoted comma");
  assert.equal(match.isNeutralVenue, true, "neutral should read TRUE from its real column, not be shifted onto country");
});

test("TEAM_NAME_TO_ID covers every team whose project name differs from the dataset's name", () => {
  assert.equal(TEAM_NAME_TO_ID.get("South Korea"), "KOR");
  assert.equal(TEAM_NAME_TO_ID.get("Czech Republic"), "CZE");
  assert.equal(TEAM_NAME_TO_ID.get("Turkey"), "TUR");
  assert.equal(TEAM_NAME_TO_ID.get("Ivory Coast"), "CIV");
  assert.equal(TEAM_NAME_TO_ID.get("Curaçao"), "CUW");
  assert.equal(TEAM_NAME_TO_ID.get("Iran"), "IRN");
  assert.equal(TEAM_NAME_TO_ID.get("Cape Verde"), "CPV");
  assert.equal(TEAM_NAME_TO_ID.get("DR Congo"), "COD");
  assert.equal(TEAM_NAME_TO_ID.get("Mexico"), "MEX");
  assert.equal(TEAM_NAME_TO_ID.get("Brazil"), "BRA");
});

test("excludeUpcomingWorldCup: false keeps already-played 2026 World Cup rows but still drops unplayed ones", () => {
  const matches = loadCompetitiveMatches(sampleCsv, { excludeUpcomingWorldCup: false });

  assert.ok(
    matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"),
    "the played 2026 World Cup match should now be kept"
  );
  assert.ok(
    !matches.some((match) => match.homeTeamId === "KOR"),
    "the unplayed (NA-score) 2026 World Cup match must still be dropped regardless of this flag"
  );
});

test("excludeUpcomingWorldCup defaults to true, matching today's behavior", () => {
  const matches = loadCompetitiveMatches(sampleCsv);

  assert.ok(!matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"));
});
