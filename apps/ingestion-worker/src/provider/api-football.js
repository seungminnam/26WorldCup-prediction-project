const LIVE_STATES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const FINAL_STATES = new Set(["FT", "AET", "PEN"]);
const POSTPONED_STATES = new Set(["PST", "CANC"]);
const RESULT_PENDING_STATES = new Set(["SUSP", "ABD", "AWD", "WO"]);

const GOAL_EVENT_TYPES = new Map([
  ["Normal Goal", "goal"],
  ["Own Goal", "own_goal"],
  ["Penalty", "penalty_goal"],
  ["Missed Penalty", "penalty_miss"]
]);

export function normalizeApiFootballPayload(payload) {
  if (!Array.isArray(payload?.response)) {
    throw new Error("API-Football response must contain a response array");
  }

  return payload.response.map(normalizeApiFootballFixture);
}

export function normalizeApiFootballFixture(payload) {
  const fixtureId = String(payload?.fixture?.id ?? "");
  const home = payload?.teams?.home;
  const away = payload?.teams?.away;

  if (!home?.id || !away?.id) {
    throw new Error(`API-Football fixture ${fixtureId} is missing home or away team`);
  }

  const status = normalizeApiFootballStatus(payload.fixture?.status?.short);
  const hasScore = status === "live" || status === "final";

  return {
    provider: "api-football",
    providerFixtureId: fixtureId,
    providerLeagueId: optionalString(payload.league?.id),
    providerSeasonId: optionalString(payload.league?.season),
    kickoffAt: payload.fixture?.date,
    venue: {
      providerVenueId: optionalString(payload.fixture?.venue?.id),
      name: payload.fixture?.venue?.name ?? null
    },
    round: payload.league?.round ?? null,
    elapsed: payload.fixture?.status?.elapsed ?? null,
    status,
    home: normalizeTeam(home, payload.goals?.home, payload.score?.penalty?.home, hasScore),
    away: normalizeTeam(away, payload.goals?.away, payload.score?.penalty?.away, hasScore),
    events: normalizeEvents(fixtureId, payload.events ?? [])
  };
}

export function normalizeApiFootballStatus(shortName) {
  if (FINAL_STATES.has(shortName)) return "final";
  if (LIVE_STATES.has(shortName)) return "live";
  if (POSTPONED_STATES.has(shortName)) return "postponed";
  if (RESULT_PENDING_STATES.has(shortName)) return "result_pending";
  return "scheduled";
}

function normalizeTeam(team, goals, penalties, hasScore) {
  return {
    providerTeamId: String(team.id),
    name: team.name,
    code: team.code ?? null,
    goals: hasScore ? Number(goals ?? 0) : null,
    penalties: hasScore && penalties !== null && penalties !== undefined ? Number(penalties) : null
  };
}

function normalizeEvents(fixtureId, events) {
  return events.flatMap((event) => {
    const eventType = GOAL_EVENT_TYPES.get(event.detail);
    if (event.type !== "Goal" || !eventType) return [];

    const providerTeamId = String(event.team?.id ?? "");
    const playerId = String(event.player?.id ?? event.player?.name ?? "unknown");
    const minute = Number(event.time?.elapsed ?? 0);
    const stoppageMinute = event.time?.extra === null || event.time?.extra === undefined
      ? null
      : Number(event.time.extra);

    return [{
      providerEventId: [
        fixtureId,
        providerTeamId,
        minute,
        stoppageMinute ?? 0,
        event.type,
        event.detail,
        playerId
      ].join(":"),
      providerTeamId,
      playerName: event.player?.name ?? "Unknown player",
      assistPlayerName: event.assist?.name ?? null,
      minute,
      stoppageMinute,
      eventType
    }];
  });
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}
