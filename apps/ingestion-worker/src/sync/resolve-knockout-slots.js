import { resolveRealKnockoutSlots } from "@wc/tournament-engine";

function toEngineTeam(row) {
  return {
    id: row.id,
    group: row.group_code,
    rating: Number(row.rating),
    fifaRanking: row.fifa_ranking ?? undefined
  };
}

function toEngineMatch(row) {
  return {
    matchNumber: row.match_number,
    group: row.group_code,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: row.home_goals ?? undefined,
    awayGoals: row.away_goals ?? undefined,
    winnerTeamId: row.winner_team_id
  };
}

export function buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows }) {
  const teamList = teamRows.map(toEngineTeam);
  const matches = fixtureRows.map(toEngineMatch);
  const idByMatchNumber = new Map(fixtureRows.map((row) => [row.match_number, row.id]));

  const resolved = resolveRealKnockoutSlots(teamList, matches);

  return [...resolved.entries()].map(([matchNumber, resolvedTeams]) => ({
    id: idByMatchNumber.get(matchNumber),
    matchNumber,
    homeTeamId: resolvedTeams.homeTeamId,
    awayTeamId: resolvedTeams.awayTeamId
  }));
}

export async function resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply }) {
  const plan = buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows });

  if (!apply) {
    return { mode: "dry-run", resolvedCount: plan.length, plan };
  }

  let rowsChanged = 0;
  try {
    for (const entry of plan) {
      await writer.applyResolveKnockoutSlotsPlan(entry);
      rowsChanged += 1;
    }
    await writer.recordIngestionRun({
      source: "knockout-slot-resolution",
      status: "completed",
      rowsSeen: plan.length,
      rowsChanged,
      errorMessage: null,
      metadata: { resolved: plan.map((entry) => entry.matchNumber) }
    });
  } catch (error) {
    try {
      await writer.recordIngestionRun({
        source: "knockout-slot-resolution",
        status: "failed",
        rowsSeen: plan.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: {}
      });
    } catch {
      // Preserve the original failure even if observability storage is unavailable.
    }
    throw error;
  }

  return { mode: "apply", resolvedCount: plan.length, plan };
}
