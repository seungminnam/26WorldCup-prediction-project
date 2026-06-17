import { readFile } from "node:fs/promises";
import { normalizeSportmonksLiveScore } from "../provider/sportmonks.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

const payload = JSON.parse(
  await readFile(new URL("../../test/fixtures/sportmonks-live-score.sample.json", import.meta.url), "utf8")
);

const normalized = normalizeSportmonksLiveScore(payload.data);
const plan = buildLiveScoreUpsertPlan(normalized, {
  fixtureByProviderId: new Map([["991001", "A-2"]]),
  teamByProviderId: new Map([
    ["7001", "KOR"],
    ["7002", "CZE"]
  ])
});

console.log(JSON.stringify({ normalized, plan }, null, 2));
