import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProviderMappings } from "../mapping/discover-provider-mappings.js";

const DEFAULT_PROVIDER_ID = "sportmonks";
const DEFAULT_PROVIDER_NAME = "Sportmonks";
const DEFAULT_PROVIDER_BASE_URL = "https://api.sportmonks.com";
const DEFAULT_PROVIDER_STATUS = "evaluation";

export function parseDiscoverMappingsArgs(argv) {
  const args = {
    providerId: DEFAULT_PROVIDER_ID,
    providerName: DEFAULT_PROVIDER_NAME,
    providerBaseUrl: DEFAULT_PROVIDER_BASE_URL,
    providerStatus: DEFAULT_PROVIDER_STATUS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--local-file") {
      args.localFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-file") {
      args.providerFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-id") {
      args.providerId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-name") {
      args.providerName = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-base-url") {
      args.providerBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider-status") {
      args.providerStatus = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.localFile) {
    throw new Error("--local-file is required");
  }

  if (!args.providerFile) {
    throw new Error("--provider-file is required");
  }

  return args;
}

export async function runDiscoverMappings({ argv, cwd = process.cwd() }) {
  const args = parseDiscoverMappingsArgs(argv);
  const basePath = normalizeCwd(cwd);
  const local = await readJson(path.resolve(basePath, args.localFile));
  const providerPayload = await readJson(path.resolve(basePath, args.providerFile));

  return discoverProviderMappings({
    local,
    providerFixtures: providerPayload.data ?? providerPayload.fixtures ?? [],
    provider: {
      id: args.providerId,
      name: args.providerName,
      baseUrl: args.providerBaseUrl,
      status: args.providerStatus
    }
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) {
    return fileURLToPath(cwd);
  }
  return cwd;
}
