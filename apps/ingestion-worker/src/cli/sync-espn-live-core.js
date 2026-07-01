import { canonicalSchedule } from "@wc/tournament-engine";
import { buildEspnResultPlans } from "../sync/espn-results.js";

export function parseSyncEspnLiveArgs(argv) {
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

export async function runSyncEspnLive({ argv, client, store, today = new Date() }) {
  const { apply } = parseSyncEspnLiveArgs(argv);
  const { dateFrom, dateTo } = pollWindow(today);

  const scoreboardPayload = await client.fetchFixturesBetween({ dateFrom, dateTo });
  const mappings = await store.loadProviderMappings("espn");
  const { plans, drift, rejected } = buildEspnResultPlans({
    events: scoreboardPayload.events ?? [],
    canonicalFixtures: canonicalSchedule,
    mappings
  });
  const skipped = rejected.map((item) => ({
    providerFixtureId: item.providerFixtureId,
    reason: item.reason ?? (item.fields.includes("canonical_fixture")
      ? `No canonical fixture for espn:${item.providerFixtureId}`
      : `Canonical participant drift for espn:${item.providerFixtureId}`)
  }));

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id),
    skipped,
    drift
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
      source: "espn",
      status: "completed",
      rowsSeen: plans.length,
      rowsChanged,
      errorMessage: null,
      metadata: { skipped, drift }
    });
  } catch (error) {
    try {
      await store.recordIngestionRun({
        source: "espn",
        status: "failed",
        rowsSeen: plans.length,
        rowsChanged,
        errorMessage: formatSyncErrorMessage(error),
        metadata: { skipped, drift }
      });
    } catch {
      // Preserve the sync failure even if observability storage is unavailable.
    }
    throw error;
  }

  return summary;
}

export function formatSyncErrorMessage(error, fallback = "Unknown sync error") {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : null;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function pollWindow(today) {
  const previousDay = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return {
    dateFrom: previousDay.toISOString().slice(0, 10),
    dateTo: nextDay.toISOString().slice(0, 10)
  };
}
