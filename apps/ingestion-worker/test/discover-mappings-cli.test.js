import assert from "node:assert/strict";
import test from "node:test";
import { parseDiscoverMappingsArgs, runDiscoverMappings } from "../src/cli/discover-mappings-core.js";

test("parses discover mappings arguments", () => {
  assert.deepEqual(
    parseDiscoverMappingsArgs([
      "--local-file",
      "local.json",
      "--provider-file",
      "api-football.json"
    ]),
    {
      localFile: "local.json",
      providerFile: "api-football.json",
      providerId: "api-football",
      providerName: "API-Football",
      providerBaseUrl: "https://v3.football.api-sports.io",
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
      "test/fixtures/api-football-fixtures.sample.json"
    ],
    cwd: new URL("..", import.meta.url)
  });

  assert.equal(result.provider.id, "api-football");
  assert.equal(result.teams.length, 2);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].fixtureId, "A-2");
});

test("retains explicit Sportmonks fallback discovery", async () => {
  const result = await runDiscoverMappings({
    argv: [
      "--local-file",
      "test/fixtures/local-tournament.sample.json",
      "--provider-file",
      "test/fixtures/sportmonks-fixtures.sample.json",
      "--provider-id",
      "sportmonks",
      "--provider-name",
      "Sportmonks",
      "--provider-base-url",
      "https://api.sportmonks.com"
    ],
    cwd: new URL("..", import.meta.url)
  });

  assert.equal(result.provider.id, "sportmonks");
  assert.equal(result.fixtures[0].providerFixtureId, "991001");
});
