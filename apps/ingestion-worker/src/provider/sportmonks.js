const FINISHED_STATES = new Set(["FT", "AET", "FT_PEN"]);
const LIVE_STATES = new Set(["LIVE", "1ST", "HT", "2ND", "ET", "PEN"]);

export function normalizeSportmonksLiveScore(payload) {
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const homeParticipant = participants.find((participant) => participant.meta?.location === "home");
  const awayParticipant = participants.find((participant) => participant.meta?.location === "away");

  if (!homeParticipant || !awayParticipant) {
    throw new Error(`Sportmonks fixture ${payload.id} is missing home or away participant`);
  }

  const scores = Array.isArray(payload.scores) ? payload.scores : [];
  const homeGoals = findCurrentGoals(scores, "home");
  const awayGoals = findCurrentGoals(scores, "away");

  return {
    provider: "sportmonks",
    providerFixtureId: String(payload.id),
    kickoffAt: payload.starting_at,
    status: normalizeState(payload.state?.short_name),
    home: {
      providerTeamId: String(homeParticipant.id),
      name: homeParticipant.name,
      goals: homeGoals
    },
    away: {
      providerTeamId: String(awayParticipant.id),
      name: awayParticipant.name,
      goals: awayGoals
    },
    events: normalizeEvents(payload.events ?? [])
  };
}

function findCurrentGoals(scores, participant) {
  const current = scores.find((score) => {
    return score.description === "CURRENT" && score.score?.participant === participant;
  });

  return Number(current?.score?.goals ?? 0);
}

function normalizeState(shortName) {
  if (FINISHED_STATES.has(shortName)) return "final";
  if (LIVE_STATES.has(shortName)) return "live";
  return "scheduled";
}

function normalizeEvents(events) {
  return events
    .filter((event) => event.type?.name === "Goal")
    .map((event) => ({
      providerEventId: String(event.id),
      providerTeamId: String(event.participant_id),
      playerName: event.player_name,
      minute: Number(event.minute),
      stoppageMinute: event.extra_minute === null || event.extra_minute === undefined ? null : Number(event.extra_minute),
      eventType: "goal"
    }));
}
