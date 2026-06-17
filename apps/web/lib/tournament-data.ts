import { createClient } from "@supabase/supabase-js";
import { fixtures as fixtureSeed, teams as teamSeed } from "@wc/tournament-engine";

export type AppTeam = {
  id: string;
  name: string;
  group: string;
  rating: number;
  flagEmoji?: string;
};

export type AppFixture = {
  id: string;
  matchNumber: number;
  group: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  venue: string;
  status: string;
  homeGoals?: number;
  awayGoals?: number;
  scorers: Array<{ teamId: string; player: string; minute: number }>;
};

export type TournamentData = {
  teams: AppTeam[];
  fixtures: AppFixture[];
  source: "supabase" | "seed";
};

type TeamRow = {
  id: string;
  name: string;
  group_code: string;
  rating: number | string;
  flag_emoji: string | null;
};

type FixtureCardRow = {
  id: string;
  match_number: number;
  group_code: string | null;
  kickoff_at: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  venue_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
};

type MatchEventRow = {
  fixture_id: string;
  team_id: string | null;
  player_name: string;
  minute: number;
  event_type: string;
};

const fallbackData: TournamentData = {
  teams: (teamSeed as AppTeam[]).map((team) => ({ ...team })),
  fixtures: (fixtureSeed as AppFixture[]).map((fixture) => ({
    ...fixture,
    scorers: [...fixture.scorers]
  })),
  source: "seed"
};

export async function getTournamentData(): Promise<TournamentData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return fallbackData;
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const [teamsResult, fixturesResult, eventsResult] = await Promise.all([
    supabase.from("teams").select("id,name,group_code,rating,flag_emoji").order("group_code").order("id"),
    supabase.from("fixture_cards").select(
      "id,match_number,group_code,kickoff_at,status,home_goals,away_goals,venue_name,home_team_id,away_team_id"
    ).order("kickoff_at"),
    supabase
      .from("match_events")
      .select("fixture_id,team_id,player_name,minute,event_type")
      .in("event_type", ["goal", "own_goal", "penalty_goal"])
      .order("minute")
  ]);

  if (teamsResult.error || fixturesResult.error || eventsResult.error) {
    return fallbackData;
  }

  const teams = mapTeams((teamsResult.data ?? []) as TeamRow[]);
  const fixtures = mapFixtures(
    (fixturesResult.data ?? []) as FixtureCardRow[],
    (eventsResult.data ?? []) as MatchEventRow[]
  );

  if (!teams.length || !fixtures.length) {
    return fallbackData;
  }

  return {
    teams,
    fixtures,
    source: "supabase"
  };
}

function mapTeams(rows: TeamRow[]): AppTeam[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    group: row.group_code,
    rating: Number(row.rating),
    flagEmoji: row.flag_emoji ?? undefined
  }));
}

function mapFixtures(rows: FixtureCardRow[], eventRows: MatchEventRow[]): AppFixture[] {
  const eventsByFixture = eventRows.reduce<Record<string, AppFixture["scorers"]>>((accumulator, row) => {
    if (!row.team_id) {
      return accumulator;
    }

    accumulator[row.fixture_id] ??= [];
    accumulator[row.fixture_id].push({
      teamId: row.team_id,
      player: row.player_name,
      minute: row.minute
    });
    return accumulator;
  }, {});

  return rows
    .filter((row) => row.group_code && row.home_team_id && row.away_team_id)
    .map((row) => ({
      id: row.id,
      matchNumber: row.match_number,
      group: row.group_code as string,
      homeTeamId: row.home_team_id as string,
      awayTeamId: row.away_team_id as string,
      kickoff: row.kickoff_at,
      venue: row.venue_name ?? "TBD",
      status: mapStatus(row.status),
      ...(typeof row.home_goals === "number" ? { homeGoals: row.home_goals } : {}),
      ...(typeof row.away_goals === "number" ? { awayGoals: row.away_goals } : {}),
      scorers: eventsByFixture[row.id] ?? []
    }));
}

function mapStatus(status: string) {
  if (status === "final") return "FT";
  if (status === "result_pending") return "Result pending";
  if (status === "live") return "Live";
  if (status === "postponed") return "Postponed";
  return "Upcoming";
}
