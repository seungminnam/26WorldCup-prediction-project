import assert from "node:assert/strict";
import test from "node:test";

import { selectBestThirdPlaceTeams } from "../src/engine/thirdPlace.js";

test("selectBestThirdPlaceTeams picks the top eight third-place rows by points, goal difference, goals for", () => {
  const groupRankings = Array.from({ length: 12 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return [
      { teamId: `${group}1`, group, points: 9, goalDifference: 5, goalsFor: 7 },
      { teamId: `${group}2`, group, points: 6, goalDifference: 2, goalsFor: 5 },
      { teamId: `${group}3`, group, points: index, goalDifference: index - 5, goalsFor: index + 1 },
      { teamId: `${group}4`, group, points: 0, goalDifference: -6, goalsFor: 1 }
    ];
  });

  const bestThirds = selectBestThirdPlaceTeams(groupRankings);

  assert.equal(bestThirds.length, 8);
  assert.deepEqual(bestThirds.map((row) => row.group), ["L", "K", "J", "I", "H", "G", "F", "E"]);
});

test("selectBestThirdPlaceTeams breaks a full tie using conduct score then FIFA ranking", () => {
  const groupRankings = [
    [{}, {}, { teamId: "X3", group: "X", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 30 }],
    [{}, {}, { teamId: "Y3", group: "Y", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 12 }]
  ];

  const bestThirds = selectBestThirdPlaceTeams(groupRankings);

  assert.deepEqual(bestThirds.map((row) => row.teamId), ["Y3", "X3"]);
});
