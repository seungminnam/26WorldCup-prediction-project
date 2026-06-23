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

function createGroupProjectionCounters(teamList) {
  return Object.fromEntries(
    teamList.map((team) => [
      team.id,
      {
        teamId: team.id,
        rankCounts: [0, 0, 0, 0],
        points: 0,
        goalDifference: 0,
        goalsFor: 0
      }
    ])
  );
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
  const groupProjectionCounters = createGroupProjectionCounters(teamList);
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
        const projection = groupProjectionCounters[row.teamId];
        projection.rankCounts[rankIndex] += 1;
        projection.points += row.points;
        projection.goalDifference += row.goalDifference;
        projection.goalsFor += row.goalsFor;
      });
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
  const groupProjections = Object.values(groupProjectionCounters)
    .map((row) => {
      const team = teamList.find((candidate) => candidate.id === row.teamId);
      const rankProbabilities = row.rankCounts.map((count) => count / simulations);
      const expectedRank = rankProbabilities.reduce(
        (sum, probability, index) => sum + probability * (index + 1),
        0
      );

      return {
        teamId: row.teamId,
        name: team.name,
        group: team.group,
        rating: team.rating,
        averagePoints: row.points / simulations,
        averageGoalDifference: row.goalDifference / simulations,
        averageGoalsFor: row.goalsFor / simulations,
        expectedRank,
        rankProbabilities,
        roundOf32: probabilitiesByTeamId.get(row.teamId)?.roundOf32 ?? 0
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.expectedRank - b.expectedRank || b.rating - a.rating);

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
