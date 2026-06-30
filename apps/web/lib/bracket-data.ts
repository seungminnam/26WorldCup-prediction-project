import { knockoutFixtures } from "@wc/tournament-engine/data";
import type { AppFixture, AppTeam } from "@/lib/tournament-data";

export type ActualBracketMatch = {
  matchNumber: number;
  round: string;
  kickoff: string;
  venue: string;
  stadium: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeDisplay: string;
  awayDisplay: string;
  homeGoals?: number;
  awayGoals?: number;
  winnerTeamId: string | null;
  wentToPenalties: boolean;
};

const ROUND_NAMES: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  third_place: "Third place",
  final: "Final"
};

export function readableSlotLabel(slot: string): string {
  if (/^1[A-L]$/.test(slot)) return `1st · Grp ${slot[1]}`;
  if (/^2[A-L]$/.test(slot)) return `2nd · Grp ${slot[1]}`;
  if (/^3 [A-L]+$/.test(slot)) {
    const groups = slot.slice(2).split("").join(" ");
    return `3rd best · ${groups}`;
  }
  if (/^W(\d+)$/.test(slot)) return `Winner M${slot.slice(1)}`;
  if (/^L(\d+)$/.test(slot)) return `Loser M${slot.slice(1)}`;
  return slot;
}

export function deriveKnockoutWinner(fixture: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
}): { winnerId: string | null; loserId: string | null } {
  const { homeTeamId, awayTeamId, homeGoals, awayGoals, homePenalties, awayPenalties } = fixture;
  if (!homeTeamId || !awayTeamId || homeGoals == null || awayGoals == null) {
    return { winnerId: null, loserId: null };
  }
  let winnerId: string;
  if (homeGoals > awayGoals) {
    winnerId = homeTeamId;
  } else if (awayGoals > homeGoals) {
    winnerId = awayTeamId;
  } else {
    if (homePenalties == null || awayPenalties == null) return { winnerId: null, loserId: null };
    winnerId = homePenalties > awayPenalties ? homeTeamId : awayTeamId;
  }
  return { winnerId, loserId: winnerId === homeTeamId ? awayTeamId : homeTeamId };
}

export function buildActualBracketMatches(
  fixtures: AppFixture[],
  teams: AppTeam[]
): Record<string, ActualBracketMatch[]> {
  const fixtureByMatchNumber = new Map<number, AppFixture>(
    fixtures
      .filter((f) => f.stage !== "group" && f.matchNumber != null)
      .map((f) => [f.matchNumber, f])
  );

  // Derive winners/losers from already-completed knockout matches (for W##/L## slot resolution)
  const winnerByMatch = new Map<number, string>();
  const loserByMatch = new Map<number, string>();
  for (const [matchNumber, fixture] of fixtureByMatchNumber) {
    const { winnerId, loserId } = deriveKnockoutWinner(fixture);
    if (winnerId && loserId) {
      winnerByMatch.set(matchNumber, winnerId);
      loserByMatch.set(matchNumber, loserId);
    }
  }

  const resolveSlot = (slot: string): string | null => {
    const wMatch = slot.match(/^W(\d+)$/);
    if (wMatch) return winnerByMatch.get(Number(wMatch[1])) ?? null;
    const lMatch = slot.match(/^L(\d+)$/);
    if (lMatch) return loserByMatch.get(Number(lMatch[1])) ?? null;
    return null;
  };

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const teamDisplay = (teamId: string | null, slot: string): string => {
    if (teamId) return teamNameById.get(teamId) ?? teamId;
    const resolved = resolveSlot(slot);
    if (resolved) return teamNameById.get(resolved) ?? resolved;
    return readableSlotLabel(slot);
  };

  const result: Record<string, ActualBracketMatch[]> = {};

  for (const canonical of knockoutFixtures) {
    const roundName = ROUND_NAMES[canonical.stage];
    if (!roundName) continue;

    const real = fixtureByMatchNumber.get(canonical.matchNumber);

    const homeTeamId = real?.homeTeamId ?? resolveSlot(canonical.homeSlot);
    const awayTeamId = real?.awayTeamId ?? resolveSlot(canonical.awaySlot);

    const { winnerId, loserId: _ } = deriveKnockoutWinner(real ?? {});

    if (!result[roundName]) result[roundName] = [];
    result[roundName].push({
      matchNumber: canonical.matchNumber,
      round: roundName,
      kickoff: real?.kickoff ?? canonical.kickoff,
      venue: real?.venue ?? canonical.venue,
      stadium: canonical.stadium,
      homeTeamId,
      awayTeamId,
      homeDisplay: teamDisplay(real?.homeTeamId ?? null, canonical.homeSlot),
      awayDisplay: teamDisplay(real?.awayTeamId ?? null, canonical.awaySlot),
      homeGoals: real?.homeGoals,
      awayGoals: real?.awayGoals,
      winnerTeamId: winnerId,
      wentToPenalties: real?.homePenalties != null || real?.awayPenalties != null
    });
  }

  return result;
}
