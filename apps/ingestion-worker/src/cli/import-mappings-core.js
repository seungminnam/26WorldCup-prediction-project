import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProviderMappingPlan } from "../mapping/provider-mapping.js";

export function parseMappingImportArgs(argv) {
  let filePath;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      filePath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!filePath) {
    throw new Error("--file is required");
  }

  return { filePath, apply };
}

export async function runMappingImport({ argv, cwd = process.cwd(), syncedAt = new Date().toISOString(), createWriter }) {
  const args = parseMappingImportArgs(argv);
  const resolvedPath = path.resolve(normalizeCwd(cwd), args.filePath);
  const payload = JSON.parse(await readFile(resolvedPath, "utf8"));
  const plan = buildProviderMappingPlan(payload, { syncedAt });

  if (!args.apply) {
    return {
      mode: "dry-run",
      plan
    };
  }

  if (!createWriter) {
    throw new Error("createWriter is required when --apply is used");
  }

  return {
    mode: "apply",
    result: await createWriter().applyProviderMappingPlan(plan)
  };
}

function normalizeCwd(cwd) {
  if (cwd instanceof URL) {
    return fileURLToPath(cwd);
  }
  return cwd;
}
