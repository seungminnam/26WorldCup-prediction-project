import { knockoutFixtures } from "../data/canonical-schedule.js";
import { thirdPlaceAssignments } from "../data/third-place-assignments.js";
import { pickKnockoutWinner, simulateScore } from "./predictor.js";

const roundNamesByStage = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  third_place: "Third place",
  final: "Final"
};

function buildBracketDisplayOrder() {
  const fixturesByMatch = new Map(knockoutFixtures.map((fixture) => [fixture.matchNumber, fixture]));
  const order = Object.fromEntries(Object.values(roundNamesByStage).map((round) => [round, []]));

  function visit(matchNumber) {
    const fixture = fixturesByMatch.get(matchNumber);
    if (!fixture) {
      throw new Error(`Missing canonical knockout fixture M${matchNumber}`);
    }

    for (const reference of [fixture.homeSlot, fixture.awaySlot]) {
      if (/^[WL]\d+$/.test(reference)) {
        visit(Number(reference.slice(1)));
      }
    }

    order[roundNamesByStage[fixture.stage]].push(matchNumber);
  }

  visit(104);
  order["Third place"].push(103);
  return order;
}

const bracketDisplayOrder = buildBracketDisplayOrder();

function buildSlotMap(groupRankings, bestThirds) {
  const slots = new Map();

  for (const ranking of groupRankings) {
    const group = ranking[0]?.group;
    if (!group || ranking.length < 2) {
      throw new Error("Every group must have at least two ranked teams");
    }

    slots.set(`1${group}`, ranking[0].teamId);
    slots.set(`2${group}`, ranking[1].teamId);
  }

  for (const third of bestThirds) {
    slots.set(`3${third.group}`, third.teamId);
  }

  return slots;
}

function resolveThirdPlaceAssignments(bestThirds) {
  const combination = bestThirds.map((third) => third.group).sort().join("");
  const assignments = thirdPlaceAssignments[combination];

  if (!assignments) {
    throw new Error(`No FIFA Annex C assignment for third-place groups ${combination}`);
  }

  return assignments;
}

function matchMetadata(fixture) {
  return {
    id: fixture.matchNumber,
    round: roundNamesByStage[fixture.stage],
    stage: fixture.stage,
    kickoff: fixture.kickoff,
    venue: fixture.venue,
    stadium: fixture.stadium
  };
}

function requireTeam(slots, slot) {
  const teamId = slots.get(slot);
  if (!teamId) {
    throw new Error(`Unable to resolve knockout slot ${slot}`);
  }
  return teamId;
}

export function buildRoundOf32(groupRankings, bestThirds) {
  const slots = buildSlotMap(groupRankings, bestThirds);
  const thirdAssignments = resolveThirdPlaceAssignments(bestThirds);

  return knockoutFixtures.slice(0, 16).map((fixture) => {
    const resolvedHomeSlot = fixture.homeSlot.startsWith("3 ")
      ? thirdAssignments[fixture.awaySlot]
      : fixture.homeSlot;
    const resolvedAwaySlot = fixture.awaySlot.startsWith("3 ")
      ? thirdAssignments[fixture.homeSlot]
      : fixture.awaySlot;

    if (!resolvedHomeSlot || !resolvedAwaySlot) {
      throw new Error(`Unable to resolve FIFA Annex C slots for M${fixture.matchNumber}`);
    }

    return {
      ...matchMetadata(fixture),
      slots: [resolvedHomeSlot, resolvedAwaySlot],
      teamIds: [requireTeam(slots, resolvedHomeSlot), requireTeam(slots, resolvedAwaySlot)]
    };
  });
}

function recordElimination(teamFinishes, loserId, round) {
  if (!teamFinishes[loserId]) {
    teamFinishes[loserId] = round;
  }
}

function simulateKnockoutMatch(homeId, awayId, teamsById, random) {
  const sampled = simulateScore(teamsById[homeId], teamsById[awayId], random);
  let winnerId;

  if (sampled.homeGoals > sampled.awayGoals) {
    winnerId = homeId;
  } else if (sampled.homeGoals < sampled.awayGoals) {
    winnerId = awayId;
  } else {
    winnerId = pickKnockoutWinner(teamsById[homeId], teamsById[awayId], random);
  }

  return {
    winnerId,
    loserId: winnerId === homeId ? awayId : homeId,
    score: {
      [homeId]: sampled.homeGoals,
      [awayId]: sampled.awayGoals
    },
    wentToPenalties: sampled.homeGoals === sampled.awayGoals
  };
}

function resolveResultReference(reference, resultsByMatch) {
  const sourceMatch = resultsByMatch.get(Number(reference.slice(1)));
  if (!sourceMatch) {
    throw new Error(`Unable to resolve knockout reference ${reference}`);
  }

  return reference.startsWith("W") ? sourceMatch.winnerId : sourceMatch.loserId;
}

export function simulateKnockout(roundOf32, teamsById, random = Math.random) {
  const rounds = {
    "Round of 32": [],
    "Round of 16": [],
    Quarterfinal: [],
    Semifinal: [],
    "Third place": [],
    Final: []
  };
  const teamFinishes = {};
  const resultsByMatch = new Map();

  for (const match of roundOf32) {
    const [homeId, awayId] = match.teamIds;
    const outcome = simulateKnockoutMatch(homeId, awayId, teamsById, random);
    const result = { ...match, ...outcome };

    recordElimination(teamFinishes, outcome.loserId, match.round);
    rounds[match.round].push(result);
    resultsByMatch.set(match.id, result);
  }

  for (const fixture of knockoutFixtures.slice(16)) {
    const round = roundNamesByStage[fixture.stage];
    const homeId = resolveResultReference(fixture.homeSlot, resultsByMatch);
    const awayId = resolveResultReference(fixture.awaySlot, resultsByMatch);
    const outcome = simulateKnockoutMatch(homeId, awayId, teamsById, random);
    const result = {
      ...matchMetadata(fixture),
      slots: [fixture.homeSlot, fixture.awaySlot],
      teamIds: [homeId, awayId],
      ...outcome
    };

    recordElimination(teamFinishes, outcome.loserId, round);
    rounds[round].push(result);
    resultsByMatch.set(fixture.matchNumber, result);
  }

  const final = resultsByMatch.get(104);
  teamFinishes[final.winnerId] = "Champion";

  for (const [round, matches] of Object.entries(rounds)) {
    const positions = new Map(bracketDisplayOrder[round].map((matchNumber, index) => [matchNumber, index]));
    matches.sort((a, b) => positions.get(a.id) - positions.get(b.id));
  }

  return { rounds, championId: final.winnerId, teamFinishes };
}
