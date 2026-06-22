import { compareFixedFixtureMetadata, normalizeEspnFixture } from "../provider/espn.js";
import { buildLiveScoreUpsertPlan } from "./live-score.js";

export function buildEspnResultPlans({ events, canonicalFixtures, mappings }) {
  const canonicalByProviderId = new Map(
    canonicalFixtures.map((fixture) => [fixture.espnFixtureId, fixture])
  );
  const plans = [];
  const drift = [];
  const rejected = [];

  for (const event of events) {
    const normalized = normalizeEspnFixture(event);
    if (normalized.status !== "live" && normalized.status !== "final") continue;

    const canonical = canonicalByProviderId.get(normalized.providerFixtureId);
    if (!canonical) {
      rejected.push({ providerFixtureId: normalized.providerFixtureId, fields: ["canonical_fixture"] });
      continue;
    }

    const fixtureDrift = compareFixedFixtureMetadata(normalized, canonical);
    if (fixtureDrift.length > 0) {
      drift.push({ fixtureId: canonical.id, providerFixtureId: normalized.providerFixtureId, drift: fixtureDrift });
    }

    const participantDrift = fixtureDrift.filter((item) => item.field === "participants");
    if (participantDrift.length > 0) {
      rejected.push({
        fixtureId: canonical.id,
        providerFixtureId: normalized.providerFixtureId,
        fields: participantDrift.map((item) => item.field)
      });
      continue;
    }

    try {
      plans.push(buildLiveScoreUpsertPlan(normalized, mappings));
    } catch (error) {
      rejected.push({
        fixtureId: canonical.id,
        providerFixtureId: normalized.providerFixtureId,
        fields: ["provider_mapping"],
        reason: error.message
      });
    }
  }

  return { plans, drift, rejected };
}

export async function syncEspnResults({ events, canonicalFixtures, mappings, writer }) {
  const result = buildEspnResultPlans({ events, canonicalFixtures, mappings });
  for (const plan of result.plans) {
    await writer.applyLiveScorePlan(plan);
  }
  return { appliedCount: result.plans.length, drift: result.drift, rejected: result.rejected };
}
