const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);
const FINAL_STATUSES = new Set(["FINISHED", "AWARDED"]);
const POSTPONED_STATUSES = new Set(["POSTPONED", "CANCELLED"]);
const RESULT_PENDING_STATUSES = new Set(["SUSPENDED"]);

export function normalizeFootballDataStatus(status) {
  if (FINAL_STATUSES.has(status)) return "final";
  if (LIVE_STATUSES.has(status)) return "live";
  if (POSTPONED_STATUSES.has(status)) return "postponed";
  if (RESULT_PENDING_STATUSES.has(status)) return "result_pending";
  return "scheduled";
}

export function normalizeFootballDataMatch(match) {
  return {
    provider: "football-data",
    providerFixtureId: String(match?.id ?? ""),
    kickoffAt: match?.utcDate,
    status: normalizeFootballDataStatus(match?.status),
    home: {
      name: match?.homeTeam?.name ?? null,
      goals: match?.score?.fullTime?.home ?? null
    },
    away: {
      name: match?.awayTeam?.name ?? null,
      goals: match?.score?.fullTime?.away ?? null
    }
  };
}

export function normalizeFootballDataPayload(payload) {
  if (!Array.isArray(payload?.matches)) {
    throw new Error("football-data.org response must contain a matches array");
  }
  return payload.matches.map(normalizeFootballDataMatch);
}
