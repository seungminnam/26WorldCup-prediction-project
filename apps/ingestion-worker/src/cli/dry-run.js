import { readFile } from "node:fs/promises";
import { normalizeApiFootballFixture } from "../provider/api-football.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

const payload = JSON.parse(
  await readFile(new URL("../../test/fixtures/api-football-live-score.sample.json", import.meta.url), "utf8")
);

const normalized = normalizeApiFootballFixture(payload.response[0]);
const plan = buildLiveScoreUpsertPlan(normalized, {
  fixtureByProviderId: new Map([["1199001", "A-2"]]),
  teamByProviderId: new Map([
    ["7001", "KOR"],
    ["7002", "CZE"]
  ])
});

console.log(JSON.stringify({ normalized, plan }, null, 2));
