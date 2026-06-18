import { normalizeApiFootballPayload } from "./api-football.js";
import { normalizeSportmonksLiveScore } from "./sportmonks.js";
import { normalizeEspnPayload } from "./espn.js";

export function normalizeProviderFixturePayload(providerId, payload, options = {}) {
  if (providerId === "espn") {
    return normalizeEspnPayload(payload, { knownTeamIds: options.knownTeamIds });
  }

  if (providerId === "api-football") {
    return normalizeApiFootballPayload(payload);
  }

  if (providerId === "sportmonks") {
    const fixtures = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
    return fixtures.map(normalizeSportmonksLiveScore);
  }

  throw new Error(`Unsupported provider: ${providerId}`);
}
