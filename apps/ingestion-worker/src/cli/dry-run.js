import { readFile } from "node:fs/promises";
import { normalizeEspnFixture } from "../provider/espn.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

const payload = JSON.parse(
  await readFile(new URL("../../test/fixtures/espn-scoreboard.sample.json", import.meta.url), "utf8")
);

const normalized = normalizeEspnFixture(payload.events[0]);
const plan = buildLiveScoreUpsertPlan(normalized, {
  fixtureByProviderId: new Map([["760415", "A-2"]]),
  teamByProviderId: new Map([
    ["203", "MEX"],
    ["774", "RSA"]
  ])
});

console.log(JSON.stringify({ normalized, plan }, null, 2));
