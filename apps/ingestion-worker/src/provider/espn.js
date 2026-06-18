const LIVE_STATUS_NAMES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
  "STATUS_HALFTIME",
  "STATUS_EXTRA_TIME",
  "STATUS_PENALTIES"
]);
const FINAL_STATUS_NAMES = new Set(["STATUS_FULL_TIME", "STATUS_FINAL"]);
const POSTPONED_STATUS_NAMES = new Set(["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_CANCELLED"]);
const RESULT_PENDING_STATUS_NAMES = new Set(["STATUS_SUSPENDED", "STATUS_ABANDONED", "STATUS_DELAYED"]);

export function normalizeEspnStatus(statusTypeName) {
  if (FINAL_STATUS_NAMES.has(statusTypeName)) return "final";
  if (LIVE_STATUS_NAMES.has(statusTypeName)) return "live";
  if (POSTPONED_STATUS_NAMES.has(statusTypeName)) return "postponed";
  if (RESULT_PENDING_STATUS_NAMES.has(statusTypeName)) return "result_pending";
  return "scheduled";
}

export function normalizeEspnFixture(event) {
  const fixtureId = String(event?.id ?? "");
  const competition = event?.competitions?.[0];
  const homeCompetitor = competition?.competitors?.find((entry) => entry.homeAway === "home");
  const awayCompetitor = competition?.competitors?.find((entry) => entry.homeAway === "away");

  if (!homeCompetitor?.team?.id || !awayCompetitor?.team?.id) {
    throw new Error(`ESPN fixture ${fixtureId} is missing home or away competitor`);
  }

  const status = normalizeEspnStatus(competition?.status?.type?.name);
  const hasScore = status === "live" || status === "final";

  return {
    provider: "espn",
    providerFixtureId: fixtureId,
    providerLeagueId: "fifa.world",
    providerSeasonId: optionalString(event?.season?.year),
    kickoffAt: event?.date,
    venue: {
      providerVenueId: optionalString(competition?.venue?.id),
      name: competition?.venue?.fullName ?? null
    },
    round: competition?.altGameNote ?? null,
    elapsed: hasScore ? secondsToMinutes(competition?.status?.clock) : null,
    status,
    home: normalizeCompetitor(homeCompetitor, hasScore),
    away: normalizeCompetitor(awayCompetitor, hasScore),
    events: normalizeEvents(fixtureId, competition?.details ?? [])
  };
}

export function normalizeEspnPayload(payload, { knownTeamIds } = {}) {
  if (!Array.isArray(payload?.events)) {
    throw new Error("ESPN response must contain an events array");
  }

  const fixtures = payload.events.map(normalizeEspnFixture);

  if (!knownTeamIds) {
    return fixtures;
  }

  return fixtures.filter(
    (fixture) => knownTeamIds.has(fixture.home.providerTeamId) && knownTeamIds.has(fixture.away.providerTeamId)
  );
}

export function normalizeEspnTeams(payload) {
  const teams = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((entry) => ({
    providerTeamId: String(entry.team.id),
    name: entry.team.displayName,
    code: entry.team.abbreviation ?? null
  }));
}

function normalizeCompetitor(competitor, hasScore) {
  return {
    providerTeamId: String(competitor.team.id),
    name: competitor.team.displayName,
    code: competitor.team.abbreviation ?? null,
    goals: hasScore ? Number(competitor.score) : null,
    penalties: null
  };
}

function normalizeEvents(fixtureId, details) {
  return details
    .filter((detail) => detail.scoringPlay === true)
    .map((detail) => {
      const teamId = String(detail.team?.id ?? "");
      const athlete = detail.athletesInvolved?.[0];
      const athleteId = athlete?.id ?? "0";
      const { minute, stoppageMinute } = parseClockDisplay(detail.clock);

      return {
        providerEventId: `${fixtureId}:${teamId}:${Math.round(detail.clock?.value ?? 0)}:${detail.type?.id ?? "0"}:${athleteId}`,
        providerTeamId: teamId,
        playerName: athlete?.displayName ?? null,
        assistPlayerName: null,
        minute,
        stoppageMinute,
        eventType: detail.ownGoal ? "own_goal" : detail.penaltyKick ? "penalty_goal" : "goal"
      };
    });
}

function parseClockDisplay(clock) {
  const display = clock?.displayValue ?? "";
  const match = display.match(/^(\d+)(?:\+(\d+))?'?$/);

  if (!match) {
    return { minute: secondsToMinutes(clock) ?? 0, stoppageMinute: null };
  }

  return {
    minute: Number(match[1]),
    stoppageMinute: match[2] ? Number(match[2]) : null
  };
}

function secondsToMinutes(clock) {
  const seconds = typeof clock === "number" ? clock : clock?.value;
  if (typeof seconds !== "number") return null;
  return Math.floor(seconds / 60);
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}
