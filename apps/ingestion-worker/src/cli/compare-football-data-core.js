import { createFootballDataClient } from "../provider/football-data-client.js";
import { normalizeFootballDataPayload } from "../provider/football-data.js";

export function parseCompareFootballDataArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date-from") {
      args.dateFrom = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--date-to") {
      args.dateTo = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.dateFrom) throw new Error("--date-from is required");
  if (!args.dateTo) throw new Error("--date-to is required");

  return args;
}

export function buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById }) {
  return footballDataMatches.map((match) => {
    const local = canonicalFixtures.find(
      (fixture) =>
        normalizeInstant(fixture.kickoff_at) === normalizeInstant(match.kickoffAt) &&
        normalizeName(canonicalTeamNamesById.get(fixture.home_team_id)) === normalizeName(match.home.name) &&
        normalizeName(canonicalTeamNamesById.get(fixture.away_team_id)) === normalizeName(match.away.name)
    );

    if (!local) {
      return {
        providerFixtureId: match.providerFixtureId,
        localFixtureId: null,
        agrees: false,
        differences: ["no canonical fixture matched this kickoff/participants"]
      };
    }

    const differences = [];
    if (local.status !== match.status) {
      differences.push(`status: local=${local.status} football-data=${match.status}`);
    }
    if (local.home_goals !== match.home.goals) {
      differences.push(`home_goals: local=${local.home_goals} football-data=${match.home.goals}`);
    }
    if (local.away_goals !== match.away.goals) {
      differences.push(`away_goals: local=${local.away_goals} football-data=${match.away.goals}`);
    }

    return {
      providerFixtureId: match.providerFixtureId,
      localFixtureId: local.id,
      agrees: differences.length === 0,
      differences
    };
  });
}

export async function runCompareFootballData({ argv, client, store }) {
  const args = parseCompareFootballDataArgs(argv);
  const payload = await client.fetchFixturesBetween({ dateFrom: args.dateFrom, dateTo: args.dateTo });
  const footballDataMatches = normalizeFootballDataPayload(payload);
  const canonicalFixtures = await store.loadCanonicalFixtures();
  const canonicalTeamNamesById = await store.loadTeamNamesById();

  return buildReconciliationDiff({ footballDataMatches, canonicalFixtures, canonicalTeamNamesById });
}

function normalizeInstant(value) {
  return new Date(value).toISOString();
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
