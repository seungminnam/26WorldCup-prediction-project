import assert from "node:assert/strict";
import test from "node:test";
import { parseDiscoverMappingsArgs, runDiscoverMappings } from "../src/cli/discover-mappings-core.js";

test("parses discover mappings arguments", () => {
  assert.deepEqual(
    parseDiscoverMappingsArgs([
      "--local-file",
      "local.json",
      "--provider-file",
      "sportmonks.json",
      "--provider-id",
      "sportmonks",
      "--provider-name",
      "Sportmonks"
    ]),
    {
      localFile: "local.json",
      providerFile: "sportmonks.json",
      providerId: "sportmonks",
      providerName: "Sportmonks",
      providerBaseUrl: "https://api.sportmonks.com",
      providerStatus: "evaluation"
    }
  );
});

test("requires local and provider files for discovery", () => {
  assert.throws(() => parseDiscoverMappingsArgs([]), /--local-file is required/);
});

test("runs mapping discovery from local files", async () => {
  const result = await runDiscoverMappings({
    argv: [
      "--local-file",
      "test/fixtures/local-tournament.sample.json",
      "--provider-file",
      "test/fixtures/sportmonks-fixtures.sample.json"
    ],
    cwd: new URL("..", import.meta.url)
  });

  assert.equal(result.provider.id, "sportmonks");
  assert.equal(result.teams.length, 2);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].fixtureId, "A-2");
});
