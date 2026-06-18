import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseFetchSportmonksFixturesArgs(argv) {
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

    if (arg === "--output") {
      args.outputPath = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.dateFrom) throw new Error("--date-from is required");
  if (!args.dateTo) throw new Error("--date-to is required");
  if (!args.outputPath) throw new Error("--output is required");

  return args;
}

export async function runFetchSportmonksFixtures({
  argv,
  cwd = process.cwd(),
  client,
  writeJson = writeJsonFile
}) {
  const args = parseFetchSportmonksFixturesArgs(argv);
  const outputPath = path.resolve(normalizeCwd(cwd), args.outputPath);
  const payload = await client.fetchFixturesBetween({
    dateFrom: args.dateFrom,
    dateTo: args.dateTo
  });

  await writeJson(outputPath, payload);

  return {
    outputPath,
    fixtureCount: Array.isArray(payload.data) ? payload.data.length : 0,
    providerMessage: payload.message ?? null,
    subscriptionPlans: extractSubscriptionPlans(payload.subscription)
  };
}

function extractSubscriptionPlans(subscriptions) {
  if (!Array.isArray(subscriptions)) return [];

  return subscriptions.flatMap((subscription) => {
    if (!Array.isArray(subscription.plans)) return [];
    return subscription.plans.map((plan) => plan.plan).filter(Boolean);
  });
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) {
    return fileURLToPath(cwd);
  }
  return cwd;
}
