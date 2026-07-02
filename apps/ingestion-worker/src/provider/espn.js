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
const STADIUM_HOSTS = {
  "AT&T Stadium": "Dallas",
  "BC Place": "Vancouver",
  "BMO Field": "Toronto",
  "Estadio Akron": "Guadalajara",
  "Estadio Banorte": "Mexico City",
  "Estadio BBVA": "Monterrey",
  "GEHA Field at Arrowhead Stadium": "Kansas City",
  "Gillette Stadium": "Boston",
  "Hard Rock Stadium": "Miami",
  "Levi's Stadium": "San Francisco Bay Area",
  "Lincoln Financial Field": "Philadelphia",
  "Lumen Field": "Seattle",
  "Mercedes-Benz Stadium": "Atlanta",
  "MetLife Stadium": "New York/New Jersey",
  "NRG Stadium": "Houston",
  "SoFi Stadium": "Los Angeles"
};

export function normalizeEspnStatus(statusTypeName, state) {
  if (FINAL_STATUS_NAMES.has(statusTypeName) || state === "post") return "final";
  if (statusTypeName === "STATUS_HALFTIME") return "HT";
  if (statusTypeName === "STATUS_EXTRA_TIME") return "ET";
  if (statusTypeName === "STATUS_PENALTIES") return "Pens";
  if (LIVE_STATUS_NAMES.has(statusTypeName) || state === "in") return "live";
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

  const venueName = competition?.venue?.fullName ?? null;
  const status = normalizeEspnStatus(
    competition?.status?.type?.name,
    competition?.status?.type?.state
  );
  const hasScore = status === "live" || status === "HT" || status === "ET" || status === "Pens" || status === "final";

  return {
    provider: "espn",
    providerFixtureId: fixtureId,
    providerLeagueId: "fifa.world",
    providerSeasonId: optionalString(event?.season?.year),
    kickoffAt: event?.date,
    venue: {
      providerVenueId: optionalString(competition?.venue?.id),
      name: venueName
    },
    venueName,
    venueCity: STADIUM_HOSTS[venueName] ?? competition?.venue?.address?.city ?? null,
    round: competition?.altGameNote ?? null,
    elapsed: hasScore ? parseClockDisplay(competition?.status?.clock).minute : null,
    stoppageMinutes: hasScore ? (parseClockDisplay(competition?.status?.clock).stoppageMinute ?? null) : null,
    status,
    home: normalizeCompetitor(homeCompetitor, hasScore),
    away: normalizeCompetitor(awayCompetitor, hasScore),
    events: normalizeEvents(fixtureId, competition?.details ?? [], competition?.shootout ?? [])
  };
}

export function normalizeEspnPayload(payload, { knownTeamIds } = {}) {
  if (!Array.isArray(payload?.events)) {
    throw new Error("ESPN response must contain an events array");
  }

  const fixtures = payload.events.map(normalizeEspnFixture);
  if (!knownTeamIds) return fixtures;

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

export function compareFixedFixtureMetadata(normalized, canonical) {
  const drift = [];

  if (new Date(normalized.kickoffAt).toISOString() !== new Date(canonical.kickoff).toISOString()) {
    drift.push({ field: "kickoff", expected: canonical.kickoff, actual: normalized.kickoffAt });
  }

  if (normalized.venueCity !== canonical.venue) {
    drift.push({ field: "venue", expected: canonical.venue, actual: normalized.venueCity });
  }

  const expectedParticipants = [canonical.homeTeamId, canonical.awayTeamId];
  const actualParticipants = [normalized.home.code, normalized.away.code];
  if (expectedParticipants.some(Boolean) && !arraysEqual(expectedParticipants, actualParticipants)) {
    drift.push({ field: "participants", expected: expectedParticipants, actual: actualParticipants });
  }

  return drift;
}

function normalizeCompetitor(competitor, hasScore) {
  return {
    providerTeamId: String(competitor.team.id),
    name: competitor.team.displayName,
    code: competitor.team.abbreviation ?? null,
    goals: hasScore ? Number(competitor.score) : null,
    penalties: hasScore && competitor.shootoutScore !== undefined
      ? Number(competitor.shootoutScore)
      : null
  };
}

function normalizeEvents(fixtureId, details, shootout) {
  const hasShootoutSummary = Array.isArray(shootout) && shootout.length > 0;
  const detailEvents = details
    .filter(
      (detail) =>
        detail.scoringPlay === true ||
        detail.yellowCard === true ||
        detail.redCard === true ||
        detail.penaltyKick === true
    )
    .filter((detail) => !hasShootoutSummary || !isShootoutPenaltyDetail(detail))
    .map((detail) => {
      const teamId = String(detail.team?.id ?? "");
      const athlete = detail.athletesInvolved?.[0];
      const athleteId = athlete?.id ?? "0";
      const { minute, stoppageMinute } = parseClockDisplay(detail.clock);

      return {
        providerEventId: `${fixtureId}:${teamId}:${Math.round(detail.clock?.value ?? 0)}:${detail.type?.id ?? "0"}:${athleteId}`,
        providerTeamId: teamId,
        playerName: nonEmptyString(athlete?.displayName) ?? "Unknown player",
        assistPlayerName: null,
        minute,
        stoppageMinute,
        eventType: classifyEventType(detail)
      };
    });

  const shootoutEvents = (shootout ?? []).flatMap((teamShootout) =>
    (teamShootout.shots ?? []).map((shot) => ({
      providerEventId: `${fixtureId}:${teamShootout.id}:shootout:${shot.shotNumber}:${shot.id ?? shot.playerId ?? shot.player ?? "0"}`,
      providerTeamId: String(teamShootout.id ?? ""),
      playerName: nonEmptyString(shot.player) ?? "Unknown player",
      assistPlayerName: null,
      minute: 120,
      stoppageMinute: Number(shot.shotNumber ?? 0),
      eventType: shot.didScore === true ? "penalty_goal" : "penalty_miss"
    }))
  );

  return [...detailEvents, ...shootoutEvents];
}

function classifyEventType(detail) {
  if (detail.redCard) return "red_card";
  if (detail.yellowCard) return "yellow_card";
  if (detail.ownGoal) return "own_goal";
  if (detail.penaltyKick) return detail.scoringPlay === true ? "penalty_goal" : "penalty_miss";
  return "goal";
}

function isShootoutPenaltyDetail(detail) {
  const { minute } = parseClockDisplay(detail.clock);
  return detail.penaltyKick === true && minute >= 120;
}

function parseClockDisplay(clock) {
  const display = clock?.displayValue ?? "";
  const match = display.match(/^(\d+)'?(?:\+(\d+)'?)?$/);

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

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
