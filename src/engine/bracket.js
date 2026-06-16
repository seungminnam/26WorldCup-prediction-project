import { pickKnockoutWinner, simulateScore } from "./predictor.js";

const fixedRoundOf32Slots = [
  ["A2", "B2"],
  ["C2", "D2"],
  ["E2", "F2"],
  ["G2", "H2"],
  ["A1", "I2"],
  ["B1", "J2"],
  ["C1", "K2"],
  ["D1", "L2"],
  ["E1", "T1"],
  ["F1", "T2"],
  ["G1", "T3"],
  ["H1", "T4"],
  ["I1", "T5"],
  ["J1", "T6"],
  ["K1", "T7"],
  ["L1", "T8"]
];

const knockoutRoundNames = ["Round of 16", "Quarterfinal", "Semifinal", "Final"];

function buildSlotMap(groupRankings, bestThirds) {
  const slots = new Map();

  for (const ranking of groupRankings) {
    const group = ranking[0].group;
    slots.set(`${group}1`, ranking[0].teamId);
    slots.set(`${group}2`, ranking[1].teamId);
  }

  bestThirds.forEach((third) => {
    slots.set(`${third.group}3`, third.teamId);
  });
  bestThirds.forEach((third, index) => {
    slots.set(`T${index + 1}`, third.teamId);
  });

  return slots;
}

export function buildRoundOf32(groupRankings, bestThirds) {
  const slots = buildSlotMap(groupRankings, bestThirds);
  const fallbackThirdIds = bestThirds.map((third) => third.teamId);

  return fixedRoundOf32Slots.map(([homeSlot, awaySlot], index) => {
    const homeTeamId = slots.get(homeSlot) ?? fallbackThirdIds[index % fallbackThirdIds.length];
    const awayTeamId = slots.get(awaySlot) ?? fallbackThirdIds[(index + 3) % fallbackThirdIds.length];

    return {
      id: 73 + index,
      round: "Round of 32",
      slots: [homeSlot, awaySlot],
      teamIds: [homeTeamId, awayTeamId]
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

export function simulateKnockout(roundOf32, teamsById, random = Math.random) {
  const rounds = { "Round of 32": [] };
  const teamFinishes = {};
  let currentMatches = roundOf32;

  for (const match of currentMatches) {
    const [homeId, awayId] = match.teamIds;
    const outcome = simulateKnockoutMatch(homeId, awayId, teamsById, random);

    recordElimination(teamFinishes, outcome.loserId, "Round of 32");
    rounds["Round of 32"].push({ ...match, ...outcome });
  }

  let winners = rounds["Round of 32"].map((match) => match.winnerId);

  for (const round of knockoutRoundNames) {
    rounds[round] = [];
    const nextWinners = [];

    for (let index = 0; index < winners.length; index += 2) {
      const homeId = winners[index];
      const awayId = winners[index + 1];
      const outcome = simulateKnockoutMatch(homeId, awayId, teamsById, random);

      recordElimination(teamFinishes, outcome.loserId, round);
      nextWinners.push(outcome.winnerId);
      rounds[round].push({
        id: `${round}-${index / 2 + 1}`,
        round,
        teamIds: [homeId, awayId],
        ...outcome
      });
    }

    winners = nextWinners;
  }

  const championId = winners[0];
  teamFinishes[championId] = "Champion";

  return { rounds, championId, teamFinishes };
}
