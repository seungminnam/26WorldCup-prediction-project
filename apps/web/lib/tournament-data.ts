import { createClient } from "@supabase/supabase-js";
import { canonicalSchedule, teams as teamSeed } from "@wc/tournament-engine";
import { mapFixtureRows } from "./tournament-data-core";

export type AppTeam = {
  id: string;
  name: string;
  group: string;
  rating: number;
  fifaRanking: number;
  flagEmoji?: string;
};

export type AppFixture = {
  id: string;
  matchNumber: number;
  stage: string;
  group: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSlot: string;
  awaySlot: string;
  kickoff: string;
  venue: string;
  hostCity?: string;
  status: string;
  homeGoals?: number;
  awayGoals?: number;
  homePenalties?: number;
  awayPenalties?: number;
  elapsedMinutes?: number | null;
  scorers: Array<{ teamId: string; player: string; minute: number; stoppageMinute?: number; eventType?: string }>;
  shootoutEvents: Array<{ teamId: string; player: string; minute: number; stoppageMinute?: number; eventType: string }>;
  cards: Array<{ teamId: string; player: string; minute: number; eventType: string }>;
};

export type TournamentData = {
  teams: AppTeam[];
  fixtures: AppFixture[];
  source: "supabase" | "seed";
  fetchedAt: string;
};

type TeamRow = {
  id: string;
  name: string;
  group_code: string;
  rating: number | string;
  fifa_ranking: number;
  flag_emoji: string | null;
};

type FixtureCardRow = {
  id: string;
  match_number: number;
  group_code: string | null;
  stage: string;
  kickoff_at: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  venue_name: string | null;
  venue_city: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_slot: string | null;
  away_slot: string | null;
  elapsed_minutes: number | null;
};

type MatchEventRow = {
  fixture_id: string;
  team_id: string | null;
  player_name: string;
  minute: number;
  stoppage_minute: number | null;
  event_type: string;
};

const fallbackData: TournamentData = {
  teams: (teamSeed as AppTeam[]).map((team) => ({ ...team })),
  fixtures: canonicalSchedule.map((fixture) => ({
    ...fixture,
    venue: fixture.stadium,
    hostCity: fixture.venue,
    scorers: [...fixture.scorers],
    shootoutEvents: [],
    cards: []
  })) as AppFixture[],
  source: "seed",
  fetchedAt: ""
};

export async function getTournamentData(): Promise<TournamentData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return withFetchedAt(fallbackData);
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const [teamsResult, fixturesResult, eventsResult] = await Promise.all([
    supabase.from("teams").select("id,name,group_code,rating,fifa_ranking,flag_emoji").order("group_code").order("id"),
    supabase.from("fixture_cards").select(
      "id,match_number,group_code,stage,kickoff_at,status,home_goals,away_goals,home_penalties,away_penalties,elapsed_minutes,venue_name,venue_city,home_team_id,away_team_id,home_slot,away_slot"
    ).order("kickoff_at"),
    supabase
      .from("match_events")
      .select("fixture_id,team_id,player_name,minute,stoppage_minute,event_type")
      .in("event_type", ["goal", "own_goal", "penalty_goal", "penalty_miss", "yellow_card", "red_card"])
      .order("minute")
      .order("stoppage_minute")
  ]);

  if (teamsResult.error || fixturesResult.error || eventsResult.error) {
    return withFetchedAt(fallbackData);
  }

  const teams = mapTeams((teamsResult.data ?? []) as TeamRow[]);
  const fixtures = mapFixtures(
    (fixturesResult.data ?? []) as FixtureCardRow[],
    (eventsResult.data ?? []) as MatchEventRow[]
  );

  if (!teams.length || !fixtures.length) {
    return withFetchedAt(fallbackData);
  }

  return withFetchedAt({
    teams,
    fixtures,
    source: "supabase"
  });
}

function mapTeams(rows: TeamRow[]): AppTeam[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    group: row.group_code,
    rating: Number(row.rating),
    fifaRanking: Number(row.fifa_ranking),
    flagEmoji: row.flag_emoji ?? undefined
  }));
}

function mapFixtures(rows: FixtureCardRow[], eventRows: MatchEventRow[]): AppFixture[] {
  return mapFixtureRows(rows, eventRows) as AppFixture[];
}

function withFetchedAt(data: Omit<TournamentData, "fetchedAt"> | TournamentData): TournamentData {
  return {
    ...data,
    fetchedAt: new Date().toISOString()
  };
}
