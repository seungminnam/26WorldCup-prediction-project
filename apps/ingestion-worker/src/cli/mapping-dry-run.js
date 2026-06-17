import { readFile } from "node:fs/promises";
import { buildProviderMappingPlan } from "../mapping/provider-mapping.js";

const payload = JSON.parse(
  await readFile(new URL("../../test/fixtures/provider-mappings.sample.json", import.meta.url), "utf8")
);

const plan = buildProviderMappingPlan(payload, {
  syncedAt: "2026-06-17T04:15:00.000Z"
});

console.log(JSON.stringify({ plan }, null, 2));
