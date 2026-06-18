import { normalizeApiFootballPayload } from "../provider/api-football.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

export function parseSyncApiFootballLiveArgs(argv) {
  let apply = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply };
}

export async function runSyncApiFootballLive({ argv, client, store }) {
  const { apply } = parseSyncApiFootballLiveArgs(argv);
  const { payload, rateLimit } = await client.fetchLiveFixtures();
  const mappings = await store.loadProviderMappings("api-football");
  const plans = normalizeApiFootballPayload(payload).map((fixture) =>
    buildLiveScoreUpsertPlan(fixture, mappings)
  );
  const quotaState = rateLimit?.remaining !== null && rateLimit?.remaining <= 10
    ? "reserve"
    : "normal";

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id),
    rateLimit,
    quotaState
  };

  if (!apply) {
    return { ...summary, plans };
  }

  let rowsChanged = 0;
  try {
    for (const plan of plans) {
      await store.applyLiveScorePlan(plan);
      rowsChanged += 1;
    }

    await store.recordIngestionRun({
      source: "api-football",
      status: "completed",
      rowsSeen: plans.length,
      rowsChanged,
      errorMessage: null,
      metadata: { rateLimit, quotaState }
    });
  } catch (error) {
    try {
      await store.recordIngestionRun({
        source: "api-football",
        status: "failed",
        rowsSeen: plans.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: { rateLimit, quotaState }
      });
    } catch {
      // Preserve the sync failure even if observability storage is unavailable.
    }
    throw error;
  }

  return summary;
}
