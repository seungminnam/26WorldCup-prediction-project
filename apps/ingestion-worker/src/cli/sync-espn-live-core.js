import { normalizeEspnPayload, normalizeEspnTeams } from "../provider/espn.js";
import { buildLiveScoreUpsertPlan } from "../sync/live-score.js";

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

  const [scoreboardPayload, teamsPayload] = await Promise.all([
    client.fetchFixturesBetween({ dateFrom, dateTo }),
    client.fetchTeams()
  ]);

  const knownTeamIds = new Set(normalizeEspnTeams(teamsPayload).map((team) => team.providerTeamId));
  const fixtures = normalizeEspnPayload(scoreboardPayload, { knownTeamIds });
  const mappings = await store.loadProviderMappings("espn");

  const plans = [];
  const skipped = [];
  for (const fixture of fixtures) {
    try {
      plans.push(buildLiveScoreUpsertPlan(fixture, mappings));
    } catch (error) {
      skipped.push({ providerFixtureId: fixture.providerFixtureId, reason: error.message });
    }
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fixtureCount: plans.length,
    fixtureIds: plans.map((plan) => plan.fixture.id),
    skipped
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
      metadata: { skipped }
    });
  } catch (error) {
    try {
      await store.recordIngestionRun({
        source: "espn",
        status: "failed",
        rowsSeen: plans.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: { skipped }
      });
    } catch {
      // Preserve the sync failure even if observability storage is unavailable.
    }
    throw error;
  }

  return summary;
}

function pollWindow(today) {
  const previousDay = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return {
    dateFrom: previousDay.toISOString().slice(0, 10),
    dateTo: nextDay.toISOString().slice(0, 10)
  };
}
