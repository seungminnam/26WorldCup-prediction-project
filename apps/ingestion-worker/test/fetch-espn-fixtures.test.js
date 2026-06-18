import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseFetchEspnFixturesArgs, runFetchEspnFixtures } from "../src/cli/fetch-espn-fixtures-core.js";

test("requires a date range and two output paths", () => {
  assert.throws(() => parseFetchEspnFixturesArgs([]), /--date-from is required/);
  assert.throws(
    () => parseFetchEspnFixturesArgs(["--date-from", "2026-06-18"]),
    /--date-to is required/
  );
  assert.throws(
    () => parseFetchEspnFixturesArgs(["--date-from", "2026-06-18", "--date-to", "2026-06-18"]),
    /--fixtures-output is required/
  );
  assert.throws(
    () =>
      parseFetchEspnFixturesArgs([
        "--date-from",
        "2026-06-18",
        "--date-to",
        "2026-06-18",
        "--fixtures-output",
        "out.json"
      ]),
    /--teams-output is required/
  );
});

test("fetches fixtures and teams and writes both raw payloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "espn-fetch-"));
  const fixturesPath = path.join(dir, "fixtures.json");
  const teamsPath = path.join(dir, "teams.json");

  const client = {
    fetchFixturesBetween: async () => ({ events: [{ id: "1" }] }),
    fetchTeams: async () => ({ sports: [] })
  };

  const result = await runFetchEspnFixtures({
    argv: [
      "--date-from",
      "2026-06-18",
      "--date-to",
      "2026-06-18",
      "--fixtures-output",
      fixturesPath,
      "--teams-output",
      teamsPath
    ],
    client
  });

  const writtenFixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  const writtenTeams = JSON.parse(await readFile(teamsPath, "utf8"));

  assert.deepEqual(writtenFixtures, { events: [{ id: "1" }] });
  assert.deepEqual(writtenTeams, { sports: [] });
  assert.deepEqual(result, { fixtureCount: 1, fixturesPath, teamsPath });

  await rm(dir, { recursive: true, force: true });
});
