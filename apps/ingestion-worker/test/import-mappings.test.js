import assert from "node:assert/strict";
import test from "node:test";
import { parseMappingImportArgs, runMappingImport } from "../src/cli/import-mappings-core.js";

test("parses mapping import arguments", () => {
  assert.deepEqual(parseMappingImportArgs(["--file", "test/fixtures/provider-mappings.sample.json"]), {
    filePath: "test/fixtures/provider-mappings.sample.json",
    apply: false
  });

  assert.deepEqual(parseMappingImportArgs(["--apply", "--file", "mappings.json"]), {
    filePath: "mappings.json",
    apply: true
  });
});

test("requires a mapping file path", () => {
  assert.throws(() => parseMappingImportArgs([]), /--file is required/);
});

test("runs mapping import in dry-run mode without calling writer", async () => {
  const result = await runMappingImport({
    argv: ["--file", "test/fixtures/provider-mappings.sample.json"],
    cwd: new URL("..", import.meta.url),
    syncedAt: "2026-06-17T04:15:00.000Z",
    createWriter() {
      throw new Error("writer should not be created in dry-run mode");
    }
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.plan.provider.id, "sportmonks");
  assert.equal(result.plan.teamMappings.length, 2);
  assert.equal(result.plan.fixtureMappings.length, 1);
});

test("runs mapping import in apply mode through injected writer", async () => {
  const writerCalls = [];

  const result = await runMappingImport({
    argv: ["--file", "test/fixtures/provider-mappings.sample.json", "--apply"],
    cwd: new URL("..", import.meta.url),
    syncedAt: "2026-06-17T04:15:00.000Z",
    createWriter() {
      return {
        async applyProviderMappingPlan(plan) {
          writerCalls.push(plan.provider.id);
          return {
            providerId: plan.provider.id,
            teamMappingsChanged: plan.teamMappings.length,
            fixtureMappingsChanged: plan.fixtureMappings.length
          };
        }
      };
    }
  });

  assert.deepEqual(writerCalls, ["sportmonks"]);
  assert.deepEqual(result, {
    mode: "apply",
    result: {
      providerId: "sportmonks",
      teamMappingsChanged: 2,
      fixtureMappingsChanged: 1
    }
  });
});
