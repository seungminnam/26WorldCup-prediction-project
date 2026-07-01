import { fixtures } from "../data/fixtures.js";
import { teams } from "../data/teams.js";
import { buildRoundOf32, simulateKnockout } from "./bracket.js";
import { knockoutFixtures } from "../data/canonical-schedule.js";
import { pickKnockoutWinner, simulateGroupMatch, simulateScore } from "./predictor.js";
import { rankAllGroups } from "./ranking.js";
import { selectBestThirdPlaceTeams } from "./thirdPlace.js";

const finishRank = {
  "Group Stage": 0,
  "Round of 32": 1,
  "Round of 16": 2,
  Quarterfinal: 3,
  Semifinal: 4,
  Final: 5,
  Champion: 6
};

const probabilityFields = [
  ["roundOf32", "Round of 32"],
  ["roundOf16", "Round of 16"],
  ["quarterfinal", "Quarterfinal"],
  ["semifinal", "Semifinal"],
  ["final", "Final"],
  ["champion", "Champion"]
];

function createCounters(teamList) {
  return Object.fromEntries(
    teamList.map((team) => [
      team.id,
      {
        teamId: team.id,
        roundOf32: 0,
        roundOf16: 0,
        quarterfinal: 0,
        semifinal: 0,
        final: 0,
        champion: 0
      }
    ])
  );
}

function createRankCounters(teamList) {
  return Object.fromEntries(teamList.map((team) => [team.id, [0, 0, 0, 0]]));
}

function canonicalGroupOutcomeKey(ranking) {
  return [...ranking]
    .sort((a, b) => a.teamId.localeCompare(b.teamId))
    .map((row) => `${row.teamId}:${row.points}`)
    .join(",");
}

function recordGroupOutcome(groupOutcomesByGroup, group, ranking) {
  groupOutcomesByGroup[group] ??= new Map();
  const outcomes = groupOutcomesByGroup[group];
  const key = canonicalGroupOutcomeKey(ranking);

  if (!outcomes.has(key)) {
    outcomes.set(key, {
      count: 0,
      pointsByTeam: new Map(ranking.map((row) => [row.teamId, row.points])),
      perTeam: new Map(ranking.map((row) => [row.teamId, { gdHistogram: new Map(), goalsForSum: 0, goalsForCount: 0 }]))
    });
  }

  const outcome = outcomes.get(key);
  outcome.count += 1;

  for (const row of ranking) {
    const stats = outcome.perTeam.get(row.teamId);
    stats.gdHistogram.set(row.goalDifference, (stats.gdHistogram.get(row.goalDifference) ?? 0) + 1);
    stats.goalsForSum += row.goalsFor;
    stats.goalsForCount += 1;
  }
}

export function pickMode(histogram, tiebreakTarget) {
  let best;

  for (const [value, count] of histogram) {
    const distance = Math.abs(value - tiebreakTarget);
    const better =
      !best ||
      count > best.count ||
      (count === best.count && distance < best.distance) ||
      (count === best.count && distance === best.distance && value < best.value);

    if (better) {
      best = { value, count, distance };
    }
  }

  return best?.value ?? 0;
}

function meanFromHistogram(histogram) {
  let weightedSum = 0;
  let total = 0;

  for (const [value, count] of histogram) {
    weightedSum += value * count;
    total += count;
  }

  return total === 0 ? 0 : weightedSum / total;
}

function pickModalOutcome(outcomes) {
  let best;

  for (const [key, outcome] of outcomes) {
    const better = !best || outcome.count > best.count || (outcome.count === best.count && key < best.key);
    if (better) {
      best = { key, ...outcome };
    }
  }

  return best;
}

export function summarizeGroupOutcome(outcomes, teamIds) {
  const modalOutcome = pickModalOutcome(outcomes);
  const summaries = new Map();

  for (const teamId of teamIds) {
    const stats = modalOutcome.perTeam.get(teamId);
    const modeGoalDifference = pickMode(stats.gdHistogram, meanFromHistogram(stats.gdHistogram));
    const averageGoalsFor = stats.goalsForCount === 0 ? 0 : stats.goalsForSum / stats.goalsForCount;

    summaries.set(teamId, {
      modePoints: modalOutcome.pointsByTeam.get(teamId),
      modeGoalDifference,
      averageGoalsFor
    });
  }

  return summaries;
}

function reached(finish, target) {
  return finishRank[finish] >= finishRank[target];
}

function isFinalStatus(status) {
  return status === "FT" || status === "final";
}

function snapshotGroupFixture(match) {
  if (isFinalStatus(match.status)) {
    return { ...match };
  }

  const { homeGoals, awayGoals, homePenalties, awayPenalties, ...pendingMatch } = match;
  return pendingMatch;
}

function actualKnockoutOutcome(fixture, homeId, awayId) {
  if (!fixture || !isFinalStatus(fixture.status)) return null;
  if (!Number.isFinite(fixture.homeGoals) || !Number.isFinite(fixture.awayGoals)) return null;

  let winnerId;
  if (fixture.homeGoals > fixture.awayGoals) {
    winnerId = homeId;
  } else if (fixture.awayGoals > fixture.homeGoals) {
    winnerId = awayId;
  } else {
    if (!Number.isFinite(fixture.homePenalties) || !Number.isFinite(fixture.awayPenalties)) return null;
    if (fixture.homePenalties === fixture.awayPenalties) return null;
    winnerId = fixture.homePenalties > fixture.awayPenalties ? homeId : awayId;
  }

  return {
    winnerId,
    loserId: winnerId === homeId ? awayId : homeId,
    score: {
      [homeId]: fixture.homeGoals,
      [awayId]: fixture.awayGoals
    },
    wentToPenalties: fixture.homeGoals === fixture.awayGoals
  };
}

function simulateKnockoutOutcome(homeId, awayId, teamsById, random) {
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

function matchMetadata(fixture) {
  return {
    id: fixture.matchNumber,
    round: roundName(fixture.stage),
    stage: fixture.stage,
    kickoff: fixture.kickoff,
    venue: fixture.venue,
    stadium: fixture.stadium
  };
}

function roundName(stage) {
  return {
    round_of_32: "Round of 32",
    round_of_16: "Round of 16",
    quarterfinal: "Quarterfinal",
    semifinal: "Semifinal",
    third_place: "Third place",
    final: "Final"
  }[stage];
}

function recordElimination(teamFinishes, loserId, round) {
  if (finishRank[teamFinishes[loserId] ?? "Group Stage"] < finishRank[round]) {
    teamFinishes[loserId] = round;
  }
}

function resolveReference(reference, resultsByMatch) {
  const sourceMatch = resultsByMatch.get(Number(reference.slice(1)));
  if (!sourceMatch) {
    throw new Error(`Unable to resolve knockout reference ${reference}`);
  }

  return reference.startsWith("W") ? sourceMatch.winnerId : sourceMatch.loserId;
}

export function simulateTournament({
  teamList = teams,
  fixtureList = fixtures,
  random = Math.random
} = {}) {
  const teamsById = Object.fromEntries(teamList.map((team) => [team.id, team]));
  const playedGroupMatches = fixtureList.map((match) => simulateGroupMatch(match, teamsById, random));
  const groupRankings = rankAllGroups(teamList, playedGroupMatches);
  const bestThirds = selectBestThirdPlaceTeams(groupRankings);
  const roundOf32 = buildRoundOf32(groupRankings, bestThirds);
  const knockout = simulateKnockout(roundOf32, teamsById, random);
  const qualifiedIds = new Set(roundOf32.flatMap((match) => match.teamIds));

  const teamFinishes = Object.fromEntries(teamList.map((team) => [team.id, "Group Stage"]));
  for (const teamId of qualifiedIds) {
    teamFinishes[teamId] = knockout.teamFinishes[teamId] ?? "Round of 32";
  }

  return {
    teams: teamList,
    playedGroupMatches,
    groupRankings,
    bestThirds,
    roundOf32,
    rounds: knockout.rounds,
    championId: knockout.championId,
    teamFinishes
  };
}

export function simulateSnapshotTournament({
  teamList = teams,
  fixtureList = fixtures,
  random = Math.random
} = {}) {
  const teamsById = Object.fromEntries(teamList.map((team) => [team.id, team]));
  const groupFixtures = fixtureList.filter((match) => match.group).map(snapshotGroupFixture);
  const playedGroupMatches = groupFixtures.map((match) => simulateGroupMatch(match, teamsById, random));
  const groupRankings = rankAllGroups(teamList, playedGroupMatches);
  const bestThirds = selectBestThirdPlaceTeams(groupRankings);
  const projectedRoundOf32 = new Map(
    buildRoundOf32(groupRankings, bestThirds).map((match) => [match.id, match])
  );
  const actualKnockoutByNumber = new Map(
    fixtureList
      .filter((match) => !match.group && Number.isFinite(match.matchNumber))
      .map((match) => [match.matchNumber, match])
  );
  const rounds = {
    "Round of 32": [],
    "Round of 16": [],
    Quarterfinal: [],
    Semifinal: [],
    "Third place": [],
    Final: []
  };
  const teamFinishes = Object.fromEntries(teamList.map((team) => [team.id, "Group Stage"]));
  const resultsByMatch = new Map();

  for (const fixture of knockoutFixtures) {
    const round = roundName(fixture.stage);
    const actual = actualKnockoutByNumber.get(fixture.matchNumber);
    const projected = projectedRoundOf32.get(fixture.matchNumber);
    const homeId = actual?.homeTeamId ?? projected?.teamIds?.[0] ?? resolveReference(fixture.homeSlot, resultsByMatch);
    const awayId = actual?.awayTeamId ?? projected?.teamIds?.[1] ?? resolveReference(fixture.awaySlot, resultsByMatch);
    const outcome =
      actualKnockoutOutcome(actual, homeId, awayId) ??
      simulateKnockoutOutcome(homeId, awayId, teamsById, random);
    const result = {
      ...matchMetadata(fixture),
      slots: fixture.matchNumber <= 88
        ? (projected?.slots ?? [fixture.homeSlot, fixture.awaySlot])
        : [fixture.homeSlot, fixture.awaySlot],
      teamIds: [homeId, awayId],
      ...outcome
    };

    recordElimination(teamFinishes, outcome.loserId, round);
    rounds[round].push(result);
    resultsByMatch.set(fixture.matchNumber, result);
  }

  const final = resultsByMatch.get(104);
  teamFinishes[final.winnerId] = "Champion";

  return {
    teams: teamList,
    playedGroupMatches,
    groupRankings,
    bestThirds,
    roundOf32: rounds["Round of 32"],
    rounds,
    championId: final.winnerId,
    teamFinishes
  };
}

export function runMonteCarlo({
  simulations = 1000,
  teamList = teams,
  fixtureList = fixtures,
  random,
  seed
} = {}) {
  return summarizeSimulations({
    simulations,
    teamList,
    random,
    seed,
    simulate: (simulationRandom) =>
      simulateTournament({ teamList, fixtureList, random: simulationRandom })
  });
}

export function runSnapshotMonteCarlo({
  simulations = 1000,
  teamList = teams,
  fixtureList = fixtures,
  random,
  seed
} = {}) {
  return summarizeSimulations({
    simulations,
    teamList,
    random,
    seed,
    simulate: (simulationRandom) =>
      simulateSnapshotTournament({ teamList, fixtureList, random: simulationRandom })
  });
}

function summarizeSimulations({ simulations, teamList, random, seed, simulate }) {
  const counters = createCounters(teamList);
  const rankCounters = createRankCounters(teamList);
  const groupOutcomesByGroup = {};
  const simulationRandom = random ?? (seed === undefined ? Math.random : createSeededRandom(seed));
  let sampleBracket;

  for (let index = 0; index < simulations; index += 1) {
    const tournament = simulate(simulationRandom);
    if (index === 0) {
      sampleBracket = tournament;
    }

    for (const [teamId, finish] of Object.entries(tournament.teamFinishes)) {
      for (const [field, target] of probabilityFields) {
        if (reached(finish, target)) {
          counters[teamId][field] += 1;
        }
      }
    }

    for (const ranking of tournament.groupRankings) {
      ranking.forEach((row, rankIndex) => {
        rankCounters[row.teamId][rankIndex] += 1;
      });
      recordGroupOutcome(groupOutcomesByGroup, ranking[0].group, ranking);
    }
  }

  const probabilities = Object.values(counters)
    .map((row) => {
      const team = teamList.find((candidate) => candidate.id === row.teamId);
      return {
        ...row,
        name: team.name,
        group: team.group,
        rating: team.rating,
        roundOf32: row.roundOf32 / simulations,
        roundOf16: row.roundOf16 / simulations,
        quarterfinal: row.quarterfinal / simulations,
        semifinal: row.semifinal / simulations,
        final: row.final / simulations,
        champion: row.champion / simulations
      };
    })
    .sort((a, b) => b.champion - a.champion || b.final - a.final || b.rating - a.rating);
  const probabilitiesByTeamId = new Map(probabilities.map((row) => [row.teamId, row]));
  const groupProjections = Object.entries(groupOutcomesByGroup)
    .flatMap(([group, outcomes]) => {
      const teamsInGroup = teamList.filter((team) => team.group === group);
      const summaries = summarizeGroupOutcome(outcomes, teamsInGroup.map((team) => team.id));

      return teamsInGroup.map((team) => ({
        teamId: team.id,
        name: team.name,
        group: team.group,
        rating: team.rating,
        ...summaries.get(team.id),
        rankProbabilities: rankCounters[team.id].map((count) => count / simulations),
        roundOf32: probabilitiesByTeamId.get(team.id)?.roundOf32 ?? 0
      }));
    })
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) ||
        b.modePoints - a.modePoints ||
        b.modeGoalDifference - a.modeGoalDifference ||
        b.averageGoalsFor - a.averageGoalsFor ||
        b.rating - a.rating
    );

  return {
    simulations,
    teams: teamList,
    probabilities,
    groupProjections,
    sampleBracket
  };
}

export function createSeededRandom(seedText) {
  let state = 2166136261;
  for (let index = 0; index < String(seedText).length; index += 1) {
    state = Math.imul(state ^ String(seedText).charCodeAt(index), 16777619);
  }

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
