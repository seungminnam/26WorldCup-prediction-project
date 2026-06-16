import { groupLabels, teams } from "./teams.js";

const pairings = [
  [0, 1],
  [2, 3],
  [0, 2],
  [3, 1],
  [3, 0],
  [1, 2]
];

const matchMeta = {
  sourceNote:
    "Seeded from public 2026 schedule references and manually verified match results. Replace with Supabase-backed official data ingestion before production.",
  "A-1": {
    matchNumber: 1,
    kickoff: "2026-06-11T20:00:00-05:00",
    venue: "Mexico City",
    status: "FT",
    homeGoals: 2,
    awayGoals: 0,
    scorers: [
      { teamId: "MEX", player: "S. Gimenez", minute: 28 },
      { teamId: "MEX", player: "H. Lozano", minute: 73 }
    ]
  },
  "A-2": {
    matchNumber: 2,
    kickoff: "2026-06-11T22:30:00-05:00",
    venue: "Guadalajara",
    status: "FT",
    homeGoals: 2,
    awayGoals: 1,
    scorers: [
      { teamId: "CZE", player: "L. Krejci", minute: 59 },
      { teamId: "KOR", player: "Hwang In-beom", minute: 67 },
      { teamId: "KOR", player: "Oh Hyeon-gyu", minute: 80 }
    ]
  },
  "B-1": {
    matchNumber: 3,
    kickoff: "2026-06-12T18:00:00-04:00",
    venue: "Toronto",
    status: "Result pending"
  },
  "D-1": {
    matchNumber: 4,
    kickoff: "2026-06-12T19:00:00-07:00",
    venue: "Los Angeles",
    status: "FT",
    homeGoals: 4,
    awayGoals: 1,
    scorers: [
      { teamId: "USA", player: "C. Pulisic", minute: 12 },
      { teamId: "USA", player: "F. Balogun", minute: 41 },
      { teamId: "PAR", player: "M. Almiron", minute: 49 },
      { teamId: "USA", player: "G. Reyna", minute: 66 },
      { teamId: "USA", player: "T. Weah", minute: 84 }
    ]
  },
  "C-1": {
    matchNumber: 5,
    kickoff: "2026-06-13T18:00:00-04:00",
    venue: "Boston",
    status: "Result pending"
  },
  "C-2": {
    matchNumber: 6,
    kickoff: "2026-06-13T13:00:00-04:00",
    venue: "New York/New Jersey",
    status: "Result pending"
  },
  "D-2": {
    matchNumber: 7,
    kickoff: "2026-06-13T15:00:00-07:00",
    venue: "Vancouver",
    status: "Result pending"
  },
  "B-2": {
    matchNumber: 8,
    kickoff: "2026-06-13T18:00:00-07:00",
    venue: "San Francisco Bay Area",
    status: "Result pending"
  },
  "E-1": {
    matchNumber: 9,
    kickoff: "2026-06-14T13:00:00-04:00",
    venue: "Philadelphia",
    status: "Result pending"
  },
  "E-2": {
    matchNumber: 10,
    kickoff: "2026-06-14T16:00:00-05:00",
    venue: "Houston",
    status: "FT",
    homeGoals: 7,
    awayGoals: 1,
    scorers: []
  },
  "F-1": {
    matchNumber: 11,
    kickoff: "2026-06-14T19:00:00-05:00",
    venue: "Dallas",
    status: "Result pending"
  },
  "F-2": {
    matchNumber: 12,
    kickoff: "2026-06-14T20:00:00-06:00",
    venue: "Monterrey",
    status: "Result pending"
  },
  "H-1": {
    matchNumber: 13,
    kickoff: "2026-06-15T13:00:00-04:00",
    venue: "Miami",
    status: "Result pending"
  },
  "H-2": {
    matchNumber: 14,
    kickoff: "2026-06-15T16:00:00-04:00",
    venue: "Atlanta",
    status: "Result pending"
  },
  "G-1": {
    matchNumber: 15,
    kickoff: "2026-06-15T16:00:00-07:00",
    venue: "Los Angeles",
    status: "Result pending"
  },
  "G-2": {
    matchNumber: 16,
    kickoff: "2026-06-15T19:00:00-07:00",
    venue: "Seattle",
    status: "Result pending"
  },
  "I-1": {
    matchNumber: 17,
    kickoff: "2026-06-16T13:00:00-04:00",
    venue: "New York/New Jersey",
    status: "Upcoming"
  },
  "I-2": {
    matchNumber: 18,
    kickoff: "2026-06-16T18:00:00-04:00",
    venue: "Boston",
    status: "Upcoming"
  },
  "J-1": {
    matchNumber: 19,
    kickoff: "2026-06-16T20:00:00-05:00",
    venue: "Kansas City",
    status: "Upcoming"
  },
  "J-2": {
    matchNumber: 20,
    kickoff: "2026-06-16T18:00:00-07:00",
    venue: "San Francisco Bay Area",
    status: "Upcoming"
  },
  "K-1": {
    matchNumber: 21,
    kickoff: "2026-06-17T16:00:00-05:00",
    venue: "Houston",
    status: "Upcoming"
  },
  "K-2": {
    matchNumber: 22,
    kickoff: "2026-06-17T19:00:00-05:00",
    venue: "Mexico City",
    status: "Upcoming"
  },
  "L-1": {
    matchNumber: 23,
    kickoff: "2026-06-17T18:00:00-04:00",
    venue: "Toronto",
    status: "Upcoming"
  },
  "L-2": {
    matchNumber: 24,
    kickoff: "2026-06-17T20:00:00-05:00",
    venue: "Dallas",
    status: "Upcoming"
  },
  "A-4": {
    matchNumber: 26,
    kickoff: "2026-06-18T19:00:00-04:00",
    venue: "Atlanta",
    status: "Upcoming"
  },
  "B-4": {
    matchNumber: 27,
    kickoff: "2026-06-18T17:00:00-07:00",
    venue: "Los Angeles",
    status: "Upcoming"
  },
  "B-3": {
    matchNumber: 28,
    kickoff: "2026-06-18T20:00:00-07:00",
    venue: "Vancouver",
    status: "Upcoming"
  }
};

export function buildGroupFixtures(teamList = teams) {
  const fixtures = [];
  let matchNumber = 1;

  for (const group of groupLabels) {
    const groupTeams = teamList.filter((team) => team.group === group);

    pairings.forEach(([homeIndex, awayIndex], index) => {
      const id = `${group}-${index + 1}`;
      const groupOffset = groupLabels.indexOf(group);
      const matchdayOffset = index < 2 ? 0 : index < 4 ? 7 : 13;
      const defaultDate = new Date(Date.UTC(2026, 5, 11 + groupOffset + matchdayOffset, 18));
      const meta = matchMeta[id] ?? {};

      fixtures.push({
        id,
        matchNumber: meta.matchNumber ?? matchNumber,
        group,
        homeTeamId: groupTeams[homeIndex].id,
        awayTeamId: groupTeams[awayIndex].id,
        kickoff: meta.kickoff ?? defaultDate.toISOString(),
        venue: meta.venue ?? defaultVenue(matchNumber),
        status: meta.status ?? "Upcoming",
        scorers: meta.scorers ?? [],
        ...(Number.isFinite(meta.homeGoals) ? { homeGoals: meta.homeGoals } : {}),
        ...(Number.isFinite(meta.awayGoals) ? { awayGoals: meta.awayGoals } : {})
      });
      matchNumber += 1;
    });
  }

  return fixtures;
}

function defaultVenue(matchNumber) {
  const venues = [
    "Mexico City",
    "Toronto",
    "Los Angeles",
    "Boston",
    "Dallas",
    "Miami",
    "Vancouver",
    "Atlanta",
    "Seattle",
    "Kansas City",
    "Houston",
    "New York/New Jersey"
  ];

  return venues[(matchNumber - 1) % venues.length];
}

export const fixtures = buildGroupFixtures();
