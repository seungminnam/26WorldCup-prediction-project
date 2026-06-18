import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseFetchEspnFixturesArgs(argv) {
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
    if (arg === "--fixtures-output") {
      args.fixturesOutput = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--teams-output") {
      args.teamsOutput = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.dateFrom) throw new Error("--date-from is required");
  if (!args.dateTo) throw new Error("--date-to is required");
  if (!args.fixturesOutput) throw new Error("--fixtures-output is required");
  if (!args.teamsOutput) throw new Error("--teams-output is required");

  return args;
}

export async function runFetchEspnFixtures({ argv, cwd = process.cwd(), client, writeJson = writeJsonFile }) {
  const args = parseFetchEspnFixturesArgs(argv);
  const basePath = normalizeCwd(cwd);
  const fixturesPath = path.resolve(basePath, args.fixturesOutput);
  const teamsPath = path.resolve(basePath, args.teamsOutput);

  const [fixturesPayload, teamsPayload] = await Promise.all([
    client.fetchFixturesBetween({ dateFrom: args.dateFrom, dateTo: args.dateTo }),
    client.fetchTeams()
  ]);

  await writeJson(fixturesPath, fixturesPayload);
  await writeJson(teamsPath, teamsPayload);

  return {
    fixtureCount: Array.isArray(fixturesPayload?.events) ? fixturesPayload.events.length : 0,
    fixturesPath,
    teamsPath
  };
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) return fileURLToPath(cwd);
  return cwd;
}
