import { fixtures } from "../data/fixtures.js";
import { teams } from "../data/teams.js";
import { buildRoundOf32, simulateKnockout } from "./bracket.js";
import { simulateGroupMatch } from "./predictor.js";
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

export function runMonteCarlo({
  simulations = 1000,
  teamList = teams,
  fixtureList = fixtures,
  random,
  seed
} = {}) {
  const counters = createCounters(teamList);
  const rankCounters = createRankCounters(teamList);
  const groupOutcomesByGroup = {};
  const simulationRandom = random ?? (seed === undefined ? Math.random : createSeededRandom(seed));
  let sampleBracket;

  for (let index = 0; index < simulations; index += 1) {
    const tournament = simulateTournament({ teamList, fixtureList, random: simulationRandom });
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
