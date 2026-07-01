"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildGroupTable,
  fixtures as fixtureSeed,
  isHostNationFixture,
  knockoutFixtures,
  predictMatch,
  rankGroup,
  runMonteCarlo,
  runSnapshotMonteCarlo,
  teams as teamSeed
} from "@wc/tournament-engine";
import type { AppFixture, AppTeam, TournamentData } from "@/lib/tournament-data";
import {
  computeCompletedGroups,
  displayFixtureScore,
  formatMatchMinute,
  shouldShowPreMatchPrediction
} from "@/lib/fixture-presentation";
import {
  formatDataLoadedAt,
  LIVE_REFRESH_INTERVAL_MS,
  shouldShowDataLoadedAt,
  shouldRefreshLiveData
} from "@/lib/live-refresh";
import { buildOutcomePresentation, formatPercentagePointDelta } from "@/lib/prediction-presentation";
import { buildActualBracketMatches } from "@/lib/bracket-data";
import type { ActualBracketMatch } from "@/lib/bracket-data";
import {
  detectViewerTimeZone,
  formatKickoffDateKey,
  formatKickoffShortDate,
  formatKickoffTime,
  getFixtureDateKeys,
  hasFixtureDate,
  selectDefaultFixtureDate
} from "@/lib/timezone-display";

type TabName = "fixtures" | "standings" | "bracket" | "forecast";
type MatchStatus = "FT" | "Upcoming" | "Live" | "Result pending" | "Postponed";
type StandingRow = {
  teamId: string;
  group: string;
  played: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
};
type KnockoutMatch = {
  id: string | number;
  round: string;
  stage: string;
  slots: string[];
  teamIds: string[];
  winnerId: string;
  kickoff: string;
  venue: string;
  stadium: string;
  score?: Record<string, number>;
  wentToPenalties?: boolean;
};
type ProbabilityRow = {
  teamId: string;
  name: string;
  group: string;
  roundOf32: number;
  roundOf16: number;
  quarterfinal: number;
  semifinal: number;
  final: number;
  champion: number;
};
type GroupProjectionRow = {
  teamId: string;
  name: string;
  group: string;
  modePoints: number;
  modeGoalDifference: number;
  averageGoalsFor: number;
  rankProbabilities: number[];
  roundOf32: number;
};
type ForecastResult = {
  simulations: number;
  probabilities: ProbabilityRow[];
  groupProjections: GroupProjectionRow[];
  sampleBracket: {
    groupRankings: StandingRow[][];
    rounds: Record<string, KnockoutMatch[]>;
    teamFinishes: Record<string, string>;
  };
};
type MatchStakesScenario = {
  key: "homeWin" | "draw" | "awayWin";
  label: string;
  homeRoundOf32: number;
  awayRoundOf32: number;
  homeRoundOf32Delta: number;
  awayRoundOf32Delta: number;
};
type MatchStakes = {
  simulations: number;
  homeTeamId: string;
  awayTeamId: string;
  scenarios: MatchStakesScenario[];
};
type MatchScorer = AppFixture["scorers"][number];

const fallbackTeams = teamSeed as AppTeam[];
const fallbackFixtures = fixtureSeed.map((fixture: any) => ({
  ...fixture,
  cards: fixture.cards ?? []
})) as AppFixture[];

const flags: Record<string, string> = {
  ARG: "🇦🇷",
  ALG: "🇩🇿",
  AUS: "🇦🇺",
  AUT: "🇦🇹",
  BEL: "🇧🇪",
  BIH: "🇧🇦",
  BRA: "🇧🇷",
  CAN: "🇨🇦",
  CIV: "🇨🇮",
  COD: "🇨🇩",
  COL: "🇨🇴",
  CPV: "🇨🇻",
  CRO: "🇭🇷",
  CZE: "🇨🇿",
  CUW: "🇨🇼",
  ECU: "🇪🇨",
  EGY: "🇪🇬",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  ESP: "🇪🇸",
  FRA: "🇫🇷",
  GER: "🇩🇪",
  GHA: "🇬🇭",
  HAI: "🇭🇹",
  IRN: "🇮🇷",
  IRQ: "🇮🇶",
  JOR: "🇯🇴",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  KSA: "🇸🇦",
  MAR: "🇲🇦",
  MEX: "🇲🇽",
  NED: "🇳🇱",
  NOR: "🇳🇴",
  NZL: "🇳🇿",
  PAN: "🇵🇦",
  PAR: "🇵🇾",
  POR: "🇵🇹",
  QAT: "🇶🇦",
  RSA: "🇿🇦",
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  SEN: "🇸🇳",
  SUI: "🇨🇭",
  SWE: "🇸🇪",
  TUN: "🇹🇳",
  TUR: "🇹🇷",
  URU: "🇺🇾",
  USA: "🇺🇸",
  UZB: "🇺🇿"
};

const bracketRoundMeta: Record<string, { interval: number; offset: number }> = {
  "Round of 32": { interval: 4, offset: 2 },
  "Round of 16": { interval: 8, offset: 4 },
  Quarterfinal: { interval: 16, offset: 8 },
  Semifinal: { interval: 32, offset: 16 },
  Final: { interval: 64, offset: 32 }
};

const roundOrder = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];
const stakesSimulationCount = 250;
const stakesScenarios = [
  { key: "homeWin" },
  { key: "draw" },
  { key: "awayWin" }
] as const;

export function MatchCentreApp({ initialData }: { initialData?: TournamentData }) {
  const router = useRouter();
  const teams = initialData?.teams?.length ? initialData.teams : fallbackTeams;
  const fixtures = initialData?.fixtures?.length ? initialData.fixtures : fallbackFixtures;
  const dataSource = initialData?.source ?? "seed";
  const fetchedAt = initialData?.fetchedAt;
  const simulationFixtures = useMemo(
    () => fixtures.filter(isGroupFixture),
    [fixtures]
  );
  const teamsById = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team])), [teams]) as Record<
    string,
    AppTeam
  >;
  const [activeTab, setActiveTab] = useState<TabName>("fixtures");
  const [viewerTimeZone, setViewerTimeZone] = useState<string>("UTC");
  const [viewerTimeZoneDetected, setViewerTimeZoneDetected] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => selectDefaultFixtureDate(fixtures, "UTC"));
  const [hasUserSelectedDate, setHasUserSelectedDate] = useState(false);
  const [simulationCount, setSimulationCount] = useState(1000);
  const [mode, setMode] = useState<"snapshot" | "pre">("snapshot");
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [forecast, setForecast] = useState<ForecastResult | undefined>();
  const [forecastSeed, setForecastSeed] = useState<string | undefined>();
  const [expandedBracketMatches, setExpandedBracketMatches] = useState<Set<number>>(new Set());
  const bracketRef = useRef<HTMLDivElement | null>(null);
  const datePillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const tab = window.location.hash.replace("#", "") as TabName;
    if (["fixtures", "standings", "bracket", "forecast"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    setViewerTimeZone(detectViewerTimeZone());
    setViewerTimeZoneDetected(true);
  }, []);

  useEffect(() => {
    if (!viewerTimeZoneDetected) return;

    const dateKeys = new Set(getFixtureDateKeys(fixtures, viewerTimeZone));
    setSelectedDate((current) => {
      if (hasUserSelectedDate && dateKeys.has(current)) {
        return current;
      }

      return selectDefaultFixtureDate(fixtures, viewerTimeZone);
    });
  }, [fixtures, hasUserSelectedDate, viewerTimeZone, viewerTimeZoneDetected]);

  useEffect(() => {
    window.history.replaceState(null, "", `#${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    function refreshIfVisible() {
      if (shouldRefreshLiveData({ dataSource, visibilityState: document.visibilityState })) {
        router.refresh();
      }
    }

    const intervalId = window.setInterval(refreshIfVisible, LIVE_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [dataSource, router]);

  useEffect(() => {
    runForecast();
    // Run once on mount. User changes are handled by the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawBracketConnectors(bracketRef.current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);

    function handleResize() {
      drawBracketConnectors(bracketRef.current);
    }
  }, [forecast, activeTab]);

  useEffect(() => {
    if (!viewerTimeZoneDetected || activeTab !== "fixtures") return;

    datePillRefs.current[selectedDate]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [activeTab, selectedDate, viewerTimeZoneDetected]);

  const visibleMatches = useMemo(
    () =>
      fixtures
        .filter((match) => formatKickoffDateKey(match.kickoff, viewerTimeZone) === selectedDate)
        .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [fixtures, selectedDate, viewerTimeZone]
  );

  const dateOptions = useMemo(
    () => getFixtureDateKeys(fixtures, viewerTimeZone),
    [fixtures, viewerTimeZone]
  );
  const todayDateKey = useMemo(
    () => formatKickoffDateKey(new Date(), viewerTimeZone),
    [viewerTimeZone]
  );
  const hasTodayFixtures = viewerTimeZoneDetected && hasFixtureDate(dateOptions, todayDateKey);
  const currentStandings = useMemo(
    () => buildStandings(completedFixtures(fixtures), teams),
    [fixtures, teams]
  );
  const completedGroupSet = useMemo(() => computeCompletedGroups(fixtures), [fixtures]);
  const [expandedFinishedGroups, setExpandedFinishedGroups] = useState<Set<string>>(new Set());
  const projectedStandings = useMemo(
    () => groupProjectedStandings(forecast?.groupProjections ?? []),
    [forecast]
  );
  const forecastProbabilitiesByTeamId = useMemo(
    () => new Map((forecast?.probabilities ?? []).map((row) => [row.teamId, row])),
    [forecast]
  );
  const fixtureStakesByMatchId = useMemo(
    () =>
      Object.fromEntries(
        visibleMatches
          .map((match) => [
            String(match.id),
            buildMatchStakes({
              match,
              fixtureList: simulationFixtures,
              teamList: teams,
              teamsById,
              baselineProbabilitiesByTeamId: forecastProbabilitiesByTeamId
            })
          ])
          .filter((entry): entry is [string, MatchStakes] => Boolean(entry[1]))
      ),
    [forecastProbabilitiesByTeamId, simulationFixtures, teams, teamsById, visibleMatches]
  );
  const actualBracketRounds = useMemo(
    () => buildActualBracketMatches(fixtures, teams),
    [fixtures, teams]
  );
  const selectedTeam = forecast?.probabilities.find(
    (team) => team.teamId === (selectedTeamId ?? forecast.probabilities[0]?.teamId)
  );
  const forecastFixtureList = useMemo(
    () =>
      mode === "pre"
        ? simulationFixtures.map(({ homeGoals, awayGoals, ...match }) => match)
        : fixtures,
    [fixtures, mode, simulationFixtures]
  );
  const currentForecastSeed = useMemo(
    () => buildForecastSeed({ mode, simulationCount, fixtureList: forecastFixtureList }),
    [mode, simulationCount, forecastFixtureList]
  );
  const isForecastStale = Boolean(forecast) && forecastSeed !== undefined && currentForecastSeed !== forecastSeed;

  function toggleFinishedGroup(group: string) {
    setExpandedFinishedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  function toggleBracketMatch(matchNumber: number) {
    setExpandedBracketMatches((current) => {
      const next = new Set(current);
      if (next.has(matchNumber)) next.delete(matchNumber);
      else next.add(matchNumber);
      return next;
    });
  }

  function runForecast() {
    const seed = buildForecastSeed({ mode, simulationCount, fixtureList: forecastFixtureList });
    const runner = mode === "snapshot" ? runSnapshotMonteCarlo : runMonteCarlo;
    const result = (runner as unknown as (options: {
      simulations: number;
      teamList: AppTeam[];
      fixtureList: AppFixture[];
      seed?: string;
    }) => ForecastResult)({
      simulations: simulationCount,
      teamList: teams,
      fixtureList: forecastFixtureList,
      seed
    });
    setForecast(result);
    setForecastSeed(seed);
    setSelectedTeamId((current) => current ?? result.probabilities[0]?.teamId);
  }

  function jumpToToday() {
    if (!hasTodayFixtures) return;

    setHasUserSelectedDate(true);
    setSelectedDate(todayDateKey);
  }

  return (
    <>
      <header className="site-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            26
          </div>
          <div>
            <p className="eyebrow">North America 2026</p>
            <h1>World Cup Match Centre</h1>
          </div>
        </div>
        <nav className="top-nav" aria-label="Primary">
          {(["fixtures", "bracket", "forecast", "standings"] as TabName[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {titleCase(tab)}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-shell">
        <section className="hero-board">
          <div className="hero-copy">
            <p className="eyebrow">Scores, bracket, forecast, standings</p>
            <h2>Follow the tournament first. Run the model when the question shows up.</h2>
          </div>
          <div className="hero-stats" aria-label="Tournament summary">
            <SummaryStat label="Matches" value="104" />
            <SummaryStat label="Teams" value="48" />
            <SummaryStat label="Knockout" value="32" />
          </div>
        </section>

        {activeTab === "fixtures" && (
          <section className="tab-panel active">
            <div className="panel match-centre">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Match centre</p>
                  <h2>Scores & Fixtures</h2>
                  <span className={`data-source ${dataSource}`}>
                    {dataSource === "supabase" ? "Live database" : "Demo seed data"}
                    {shouldShowDataLoadedAt({ fetchedAt, viewerTimeZoneDetected })
                      ? ` · Loaded ${formatDataLoadedAt(fetchedAt, viewerTimeZone)}`
                      : ""}
                  </span>
                </div>
                <div className="date-filter-controls">
                  <button
                    className={`today-jump ${selectedDate === todayDateKey ? "active" : ""}`}
                    type="button"
                    disabled={!hasTodayFixtures}
                    onClick={jumpToToday}
                  >
                    Today
                  </button>
                  <div className="filter-pills" aria-label="Match day filter">
                    {dateOptions.map((day) => {
                      const dayMatches = fixtures.filter(
                        (match) => formatKickoffDateKey(match.kickoff, viewerTimeZone) === day
                      );
                      const isToday = viewerTimeZoneDetected && day === todayDateKey;
                      return (
                        <button
                          key={day}
                          ref={(element) => {
                            datePillRefs.current[day] = element;
                          }}
                          className={`day-pill ${selectedDate === day ? "active" : ""} ${isToday ? "today" : ""}`}
                          type="button"
                          onClick={() => {
                            setHasUserSelectedDate(true);
                            setSelectedDate(day);
                          }}
                        >
                          <span>{dayMatches.length} matches</span>
                          <strong>
                            {formatKickoffShortDate(dayMatches[0].kickoff, viewerTimeZone)}
                            {isToday ? " · Today" : ""}
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="match-list" aria-live="polite">
                {visibleMatches[0] && (
                  <div className={`date-divider ${selectedDate === todayDateKey ? "today" : ""}`}>
                    {formatKickoffShortDate(visibleMatches[0].kickoff, viewerTimeZone)}
                    {viewerTimeZoneDetected && selectedDate === todayDateKey ? " · Today" : ""}
                  </div>
                )}
                {visibleMatches.map((match) => (
                  <FixtureCard
                    key={match.id}
                    match={match}
                    teamsById={teamsById}
                    viewerTimeZone={viewerTimeZone}
                    isToday={formatKickoffDateKey(match.kickoff, viewerTimeZone) === todayDateKey}
                    stakes={fixtureStakesByMatchId[String(match.id)]}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "standings" && (
          <section className="tab-panel active">
            <div className="standings-layout">
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Current tables</p>
                    <h2>Group Standings</h2>
                  </div>
                  <span>Completed results only</span>
                </div>
                <div className="standings-grid">
                  {currentStandings.map((rows) => (
                    <StandingTable key={rows[0].group} rows={rows} teamsById={teamsById} />
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Forecast sample</p>
                    <h2>Projected Group Tables</h2>
                  </div>
                  <span>Latest simulation path</span>
                </div>
                {isForecastStale && <ForecastStaleNotice onRerun={runForecast} />}
                <div className="standings-grid">
                  {projectedStandings.map((rows) =>
                    completedGroupSet.has(rows[0].group) ? (
                      <FinishedGroupCard
                        key={rows[0].group}
                        rows={rows}
                        teamsById={teamsById}
                        expanded={expandedFinishedGroups.has(rows[0].group)}
                        onToggle={() => toggleFinishedGroup(rows[0].group)}
                      />
                    ) : (
                      <ProjectedStandingTable key={rows[0].group} rows={rows} teamsById={teamsById} />
                    )
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "bracket" && (
          <section className="tab-panel active">
            <div className="panel bracket-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Knockout path</p>
                  <h2>Tournament Bracket</h2>
                </div>
                <span>Results + model predictions</span>
              </div>
              <div ref={bracketRef} className="bracket-stage">
                <svg className="bracket-connectors" aria-hidden="true" />
                <div className="bracket-columns">
                  {roundOrder.map((round) => (
                    <div key={round} className="round tree-round">
                      <h3>{round}</h3>
                      {(actualBracketRounds[round] ?? []).map((match, index) => {
                        const meta = bracketRoundMeta[round];
                        const isFt = match.winnerTeamId != null;
                        const isUpcoming = !isFt && match.homeTeamId != null && match.awayTeamId != null;
                        const isPending = !isFt && (match.homeTeamId == null || match.awayTeamId == null);
                        const expanded = expandedBracketMatches.has(match.matchNumber);

                        const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
                        const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
                        const prediction =
                          homeTeam && awayTeam
                            ? predictMatch(homeTeam, awayTeam, { isNeutralVenue: true })
                            : undefined;
                        const outcomes = prediction && homeTeam && awayTeam
                          ? buildOutcomePresentation({ homeName: homeTeam.name, awayName: awayTeam.name, probabilities: prediction.probabilities })
                          : [];

                        const modelCorrect =
                          isFt && prediction && homeTeam && awayTeam
                            ? (prediction.probabilities.homeWin >= prediction.probabilities.awayWin
                                ? match.winnerTeamId === match.homeTeamId
                                : match.winnerTeamId === match.awayTeamId)
                            : null;

                        const favoredWinPct = prediction
                          ? Math.max(prediction.probabilities.homeWin, prediction.probabilities.awayWin)
                          : null;
                        const favoredName = prediction && homeTeam && awayTeam
                          ? (prediction.probabilities.homeWin >= prediction.probabilities.awayWin ? homeTeam.name : awayTeam.name)
                          : null;

                        return (
                          <article
                            key={match.matchNumber}
                            className={`bracket-match${isFt ? " ft" : ""}${isPending ? " pending" : ""}`}
                            style={{ "--row-start": index * meta.interval + meta.offset } as React.CSSProperties}
                          >
                            <div className="match-location">
                              {match.stadium}, {match.venue} · M{match.matchNumber}
                            </div>

                            <div className={`match-chip${isFt && match.winnerTeamId === match.homeTeamId ? " winner" : ""}${isPending && !match.homeTeamId ? " pending" : ""}`}>
                              <span>
                                {homeTeam ? (
                                  <>{teamFlag(match.homeTeamId!, teamsById)} {homeTeam.name}</>
                                ) : (
                                  <span className="pending">{match.homeDisplay}</span>
                                )}
                              </span>
                              <span>{match.homeGoals ?? "-"}</span>
                            </div>

                            <div className={`match-chip${isFt && match.winnerTeamId === match.awayTeamId ? " winner" : ""}${isPending && !match.awayTeamId ? " pending" : ""}`}>
                              <span>
                                {awayTeam ? (
                                  <>{teamFlag(match.awayTeamId!, teamsById)} {awayTeam.name}</>
                                ) : (
                                  <span className="pending">{match.awayDisplay}</span>
                                )}
                              </span>
                              <span>{match.awayGoals ?? "-"}</span>
                            </div>

                            {match.wentToPenalties && (
                              <div className="penalty-note">Advanced after penalties</div>
                            )}

                            {prediction && (
                              <>
                                <div
                                  className="bracket-model-row"
                                  onClick={() => toggleBracketMatch(match.matchNumber)}
                                  role="button"
                                  aria-expanded={expanded}
                                >
                                  <span>
                                    {favoredName} {favoredWinPct != null ? `${Math.round(favoredWinPct * 100)}%` : ""}
                                    {isFt ? (
                                      modelCorrect
                                        ? <span className="bracket-model-correct"> ✓</span>
                                        : <span className="bracket-model-wrong"> ✗</span>
                                    ) : null}
                                  </span>
                                  <span>{expanded ? "▴" : "▾"}</span>
                                </div>

                                {expanded && (
                                  <div className="bracket-model-expanded">
                                    <div className="probability-legend" aria-label="Match outcome probabilities">
                                      {outcomes.map((outcome) => (
                                        <div key={outcome.key} className={`probability-legend-item ${outcome.key}`}>
                                          <span className="probability-name">
                                            <i className={`probability-dot ${outcome.key}`} aria-hidden="true" />
                                            {outcome.label}
                                          </span>
                                          <strong>{outcome.percentLabel}</strong>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="probability-ribbon" aria-hidden="true">
                                      {outcomes.map((outcome) => (
                                        <span
                                          key={outcome.key}
                                          className={`probability-segment ${outcome.key}`}
                                          style={{ width: outcome.width }}
                                        />
                                      ))}
                                    </div>
                                    <div className="likely-scorelines" aria-label="Most likely scorelines">
                                      {prediction.scorelines.map((scoreline) => (
                                        <span key={`${scoreline.homeGoals}-${scoreline.awayGoals}`}>
                                          {scoreline.homeGoals}-{scoreline.awayGoals} {Math.round(scoreline.probability * 100)}%
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Third-place match */}
              {(() => {
                const r3 = (actualBracketRounds["Third place"] ?? [])[0];
                if (!r3) return null;
                const homeTeam = r3.homeTeamId ? teamsById[r3.homeTeamId] : undefined;
                const awayTeam = r3.awayTeamId ? teamsById[r3.awayTeamId] : undefined;
                return (
                  <div className="third-place-bracket">
                    <h3>Third place</h3>
                    <article className={`bracket-match${r3.winnerTeamId ? " ft" : ""}`}>
                      <div className="match-location">{r3.stadium}, {r3.venue} · M{r3.matchNumber}</div>
                      <div className={`match-chip${r3.winnerTeamId === r3.homeTeamId ? " winner" : ""}`}>
                        <span>{homeTeam ? <>{teamFlag(r3.homeTeamId!, teamsById)} {homeTeam.name}</> : <span className="pending">{r3.homeDisplay}</span>}</span>
                        <span>{r3.homeGoals ?? "-"}</span>
                      </div>
                      <div className={`match-chip${r3.winnerTeamId === r3.awayTeamId ? " winner" : ""}`}>
                        <span>{awayTeam ? <>{teamFlag(r3.awayTeamId!, teamsById)} {awayTeam.name}</> : <span className="pending">{r3.awayDisplay}</span>}</span>
                        <span>{r3.awayGoals ?? "-"}</span>
                      </div>
                      {r3.wentToPenalties && <div className="penalty-note">Advanced after penalties</div>}
                    </article>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {activeTab === "forecast" && forecast && selectedTeam && (
          <section className="tab-panel active">
            <div className="forecast-layout">
              <aside className="panel forecast-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Forecast lab</p>
                    <h2>Prediction Model</h2>
                  </div>
                  <span>
                    {forecast.simulations.toLocaleString()} runs · {mode === "snapshot" ? "Current snapshot" : "Clean pre-tournament"}
                  </span>
                </div>
                <div className="forecast-controls">
                  <label>
                    Simulations
                    <select value={simulationCount} onChange={(event) => setSimulationCount(Number(event.target.value))}>
                      <option value={250}>250</option>
                      <option value={1000}>1,000</option>
                      <option value={5000}>5,000</option>
                    </select>
                  </label>
                  <label>
                    Mode
                    <select value={mode} onChange={(event) => setMode(event.target.value as "snapshot" | "pre")}>
                      <option value="snapshot">Current snapshot</option>
                      <option value="pre">Clean pre-tournament</option>
                    </select>
                  </label>
                  <button type="button" onClick={runForecast}>
                    Run Forecast
                  </button>
                </div>
                {isForecastStale && <ForecastStaleNotice onRerun={runForecast} />}
                <div className="favorites" aria-live="polite">
                  {forecast.probabilities.slice(0, 4).map((team, index) => (
                    <article className="favorite-card" key={team.teamId}>
                      <span className="eyebrow">#{index + 1} title odds</span>
                      <strong>
                        {teamFlag(team.teamId, teamsById)} {team.name}
                      </strong>
                      <div className="metric">
                        <span>Champion</span>
                        <b>{formatPercent(team.champion)}</b>
                      </div>
                      <div className="bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(3, team.champion * 100)}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
                <TeamDetail
                  team={selectedTeam}
                  finish={forecast.sampleBracket.teamFinishes[selectedTeam.teamId]}
                  teamsById={teamsById}
                />
              </aside>

              <div className="panel table-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Team probabilities</p>
                    <h2>Forecast Table</h2>
                  </div>
                  <span>Click a row to inspect route profile</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Group</th>
                        <th>R32</th>
                        <th>R16</th>
                        <th>QF</th>
                        <th>SF</th>
                        <th>Final</th>
                        <th>Champion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.probabilities.map((team) => (
                        <tr
                          key={team.teamId}
                          className={team.teamId === selectedTeam.teamId ? "selected" : ""}
                          onClick={() => setSelectedTeamId(team.teamId)}
                        >
                          <td>
                            <span className="team-name">
                              <span className="flag-badge">{teamFlag(team.teamId, teamsById)}</span>
                              {team.name}
                            </span>
                          </td>
                          <td>
                            <span className="group-chip">{team.group}</span>
                          </td>
                          <td>{formatPercent(team.roundOf32)}</td>
                          <td>{formatPercent(team.roundOf16)}</td>
                          <td>{formatPercent(team.quarterfinal)}</td>
                          <td>{formatPercent(team.semifinal)}</td>
                          <td>{formatPercent(team.final)}</td>
                          <td>
                            <strong>{formatPercent(team.champion)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FixtureCard({
  match,
  teamsById,
  viewerTimeZone,
  isToday,
  stakes
}: {
  match: AppFixture;
  teamsById: Record<string, AppTeam>;
  viewerTimeZone: string;
  isToday: boolean;
  stakes?: MatchStakes;
}) {
  const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
  const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
  const prediction =
    shouldShowPreMatchPrediction(match.status) && homeTeam && awayTeam
      ? predictMatch(homeTeam, awayTeam, { isNeutralVenue: !isHostNationFixture(match.homeTeamId ?? "") })
      : undefined;
  const outcomes = prediction && homeTeam && awayTeam
    ? buildOutcomePresentation({
        homeName: homeTeam.name,
        awayName: awayTeam.name,
        probabilities: prediction.probabilities
      })
    : [];
  const goalEvents = visibleGoalScorers(match);
  const shootout = penaltyShootoutSummary(match, teamsById);

  return (
    <article className={`fixture-card ${isToday ? "today" : ""}`}>
      <div className="match-meta">
        <span className={`status ${match.status === "FT" ? "ft" : ""}`}>{match.status as MatchStatus}</span>
        <span>Match {match.matchNumber}</span>
        <span>{match.hostCity ? `${match.venue} · ${match.hostCity}` : match.venue}</span>
      </div>
      <div className="teams-score">
        <ScoreRow
          teamId={match.homeTeamId}
          slot={match.homeSlot}
          score={scoreCell(match, "home")}
          teamsById={teamsById}
        />
        <ScoreRow
          teamId={match.awayTeamId}
          slot={match.awaySlot}
          score={scoreCell(match, "away")}
          teamsById={teamsById}
        />
        {shootout && (
          <div className="shootout-summary" aria-label={shootout.label}>
            <span>{shootout.score}</span>
            <strong>{shootout.label}</strong>
          </div>
        )}
      </div>
      <FixtureEventPanel
        match={match}
        goalEvents={goalEvents}
        teamsById={teamsById}
        viewerTimeZone={viewerTimeZone}
      />
      {prediction && (
        <div className="fixture-prediction">
          <div className="prediction-heading">
            <span>{prediction.model.label}</span>
            <strong>
              Likely {prediction.mostLikelyScore.homeGoals}-{prediction.mostLikelyScore.awayGoals}
            </strong>
          </div>
          <div className="probability-legend" aria-label="Match outcome probabilities">
            {outcomes.map((outcome) => (
              <div key={outcome.key} className={`probability-legend-item ${outcome.key}`}>
                <span className="probability-name">
                  <i className={`probability-dot ${outcome.key}`} aria-hidden="true" />
                  <span title={outcome.label}>{outcome.label}</span>
                </span>
                <strong>{outcome.percentLabel}</strong>
              </div>
            ))}
          </div>
          <div className="probability-ribbon" aria-hidden="true">
            {outcomes.map((outcome) => (
              <span
                key={outcome.key}
                className={`probability-segment ${outcome.key}`}
                style={{ width: outcome.width }}
              />
            ))}
          </div>
          <div className="likely-scorelines" aria-label="Most likely scorelines">
            {prediction.scorelines.map((scoreline) => (
              <span key={`${scoreline.homeGoals}-${scoreline.awayGoals}`}>
                {scoreline.homeGoals}-{scoreline.awayGoals} {Math.round(scoreline.probability * 100)}%
              </span>
            ))}
          </div>
          <small>Statistical baseline, not a trained ML model</small>
        </div>
      )}
      {stakes && homeTeam && awayTeam && (
        <div className="fixture-stakes">
          <div className="stakes-heading">
            <span>Qualification impact</span>
            <strong>{stakes.simulations} snapshot sims</strong>
          </div>
          <div className="stakes-grid" aria-label="Conditional Round of 32 impact">
            {stakes.scenarios.map((scenario) => (
              <div key={scenario.key} className="stakes-card">
                <span>{scenario.label}</span>
                <strong>
                  {homeTeam.id} {formatPercent(scenario.homeRoundOf32)}
                  <span className={`delta-badge ${deltaTone(scenario.homeRoundOf32Delta)}`}>
                    {formatPercentagePointDelta(
                      scenario.homeRoundOf32,
                      scenario.homeRoundOf32 - scenario.homeRoundOf32Delta
                    )}
                  </span>
                </strong>
                <small>
                  {awayTeam.id} {formatPercent(scenario.awayRoundOf32)}
                  <span className={`delta-badge ${deltaTone(scenario.awayRoundOf32Delta)}`}>
                    {formatPercentagePointDelta(
                      scenario.awayRoundOf32,
                      scenario.awayRoundOf32 - scenario.awayRoundOf32Delta
                    )}
                  </span>
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function ScoreRow({
  teamId,
  slot,
  score,
  teamsById
}: {
  teamId: string | null;
  slot: string;
  score: string | number;
  teamsById: Record<string, AppTeam>;
}) {
  const label = teamId ? teamName(teamId, teamsById) : slotLabel(slot);

  return (
    <div className="score-row">
      <div className="team-column">
        <span className="team-inline">
          <span className="flag-badge">{teamId ? teamFlag(teamId, teamsById) : "·"}</span>
          <span className="team-name">{label}</span>
        </span>
      </div>
      <span className="score">{score}</span>
    </div>
  );
}

function FixtureEventPanel({
  match,
  goalEvents,
  teamsById,
  viewerTimeZone
}: {
  match: AppFixture;
  goalEvents: MatchScorer[];
  teamsById: Record<string, AppTeam>;
  viewerTimeZone: string;
}) {
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [showShootout, setShowShootout] = useState(false);
  const groups = groupGoalScorers(goalEvents);
  const visibleGroups = showAllGoals ? groups : groups.slice(0, 4);
  const hiddenGoalCount = groups.length - visibleGroups.length;
  const shootoutAttempts = shootoutAttemptsForDisplay(match);

  if (groups.length === 0 && shootoutAttempts.length === 0) {
    return (
      <div className="fixture-events empty">
        <span>Details</span>
        <strong>{fixtureDetailText(match, viewerTimeZone)}</strong>
      </div>
    );
  }

  return (
    <div className="fixture-events">
      {groups.length > 0 && (
        <>
          <div className="fixture-events-heading">
            <span>Goals</span>
            {hiddenGoalCount > 0 && (
              <button type="button" onClick={() => setShowAllGoals((current) => !current)}>
                {showAllGoals ? "Show less" : `+${hiddenGoalCount} more`}
              </button>
            )}
          </div>
          <div className="fixture-event-list" aria-label="Goal events">
            {visibleGroups.map((group) => (
              <div key={group.key} className={`fixture-event ${eventSideClass(match, group.teamId)}`}>
                <span className="event-minutes">
                  {group.events.map((scorer, index) => (
                    <span key={goalScorerKey(scorer, index)} className="event-minute">
                      {formatMatchMinute(scorer)}
                      {scorerBadge(scorer) && <em>{scorerBadge(scorer)}</em>}
                    </span>
                  ))}
                </span>
                <span className="event-team-code">{teamCodeForEvent(group.teamId, teamsById)}</span>
                <strong>{group.player}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      {shootoutAttempts.length > 0 && (
        <div className="shootout-disclosure">
          <button
            type="button"
            aria-expanded={showShootout}
            onClick={() => setShowShootout((current) => !current)}
          >
            <span>Shootout</span>
            <strong>{shootoutAttemptsSummary(match, shootoutAttempts)}</strong>
            <i aria-hidden="true">{showShootout ? "−" : "+"}</i>
          </button>
          {showShootout && (
            <div className="shootout-attempts" aria-label="Penalty shootout attempts">
              {shootoutAttempts.map((attempt, index) => (
                <div
                  key={`${attempt.teamId}-${attempt.player}-${attempt.eventType}-${index}`}
                  className={`shootout-attempt ${eventSideClass(match, attempt.teamId)} ${attempt.eventType}`}
                >
                  <span
                    className="shootout-order"
                    aria-label={shootoutAttemptLabel(attempt, index)}
                    title={shootoutAttemptLabel(attempt, index)}
                  >
                    {shootoutAttemptNumber(attempt, index)}
                  </span>
                  <strong>{attempt.player}</strong>
                  <em>{teamCodeForEvent(attempt.teamId, teamsById)}</em>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StandingTable({
  rows,
  teamsById
}: {
  rows: ReturnType<typeof buildStandings>[number];
  teamsById: Record<string, AppTeam>;
}) {
  return (
    <article className="standing-card">
      <h3>Group {rows[0].group}</h3>
      <table className="mini-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>Pts</th>
            <th>GD</th>
            <th>GF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.teamId}>
              <td>{index + 1}</td>
              <td>
                <span className="team-name compact">
                  {teamFlag(row.teamId, teamsById)} {teamName(row.teamId, teamsById)}
                </span>
              </td>
              <td>{row.played}</td>
              <td>
                <strong>{row.points}</strong>
              </td>
              <td>
                {row.goalDifference > 0 ? "+" : ""}
                {row.goalDifference}
              </td>
              <td>{row.goalsFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function ForecastStaleNotice({ onRerun }: { onRerun: () => void }) {
  return (
    <div className="forecast-stale-notice">
      <span>New results came in since this forecast ran.</span>
      <button type="button" onClick={onRerun}>
        Recalculate
      </button>
    </div>
  );
}

function ProjectedStandingTable({
  rows,
  teamsById
}: {
  rows: GroupProjectionRow[];
  teamsById: Record<string, AppTeam>;
}) {
  return (
    <article className="standing-card projected">
      <h3>Group {rows[0].group}</h3>
      <table className="mini-table projected-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Pts</th>
            <th>GD</th>
            <th>Top 2</th>
            <th>R32</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.teamId}>
              <td>{index + 1}</td>
              <td>
                <span className="team-name compact">
                  {teamFlag(row.teamId, teamsById)} {teamName(row.teamId, teamsById)}
                </span>
              </td>
              <td>{formatRounded(row.modePoints)}</td>
              <td>{formatSignedRounded(row.modeGoalDifference)}</td>
              <td>{formatPercent(topTwoProbability(row))}</td>
              <td>
                <strong>{formatPercent(row.roundOf32)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function FinishedGroupCard({
  rows,
  teamsById,
  expanded,
  onToggle
}: {
  rows: GroupProjectionRow[];
  teamsById: Record<string, AppTeam>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="standing-card projected finished-group-card">
      <button type="button" className="finished-collapsed" onClick={onToggle} aria-expanded={expanded}>
        <span>
          Group {rows[0].group} · Finished — see Standings for the final table
        </span>
        <span className={`finished-collapsed-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {expanded && <ProjectedStandingTable rows={rows} teamsById={teamsById} />}
    </article>
  );
}

function TeamDetail({
  team,
  finish,
  teamsById
}: {
  team: ForecastResult["probabilities"][number];
  finish: string;
  teamsById: Record<string, AppTeam>;
}) {
  return (
    <div className="team-detail">
      <div>
        <p className="eyebrow">Group {team.group}</p>
        <h3>
          {teamFlag(team.teamId, teamsById)} {team.name}
        </h3>
      </div>
      <div className="route-list">
        <RouteRow label="Sample finish" value={finish ?? "Group Stage"} />
        <RouteRow label="Round of 32" value={formatPercent(team.roundOf32)} />
        <RouteRow label="Quarterfinal" value={formatPercent(team.quarterfinal)} />
        <RouteRow label="Final" value={formatPercent(team.final)} />
        <RouteRow label="Champion" value={formatPercent(team.champion)} />
      </div>
    </div>
  );
}

function RouteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="route-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildStandings(matchList: AppFixture[], teamList: AppTeam[]) {
  return groupLabels(teamList).map((group) => {
    const groupTeams = teamList.filter((team) => team.group === group);
    const groupFixtures = matchList.filter((match) => match.group === group);
    return rankGroup(buildGroupTable(groupTeams, groupFixtures), groupFixtures);
  });
}

function completedFixtures(fixtureList: AppFixture[]) {
  return fixtureList.filter(
    (match) =>
      match.status === "FT" &&
      Number.isFinite(match.homeGoals) &&
      Number.isFinite(match.awayGoals)
  );
}

function buildMatchStakes({
  match,
  fixtureList,
  teamList,
  teamsById,
  baselineProbabilitiesByTeamId
}: {
  match: AppFixture;
  fixtureList: AppFixture[];
  teamList: AppTeam[];
  teamsById: Record<string, AppTeam>;
  baselineProbabilitiesByTeamId: Map<string, ProbabilityRow>;
}): MatchStakes | undefined {
  if (!isGroupFixture(match) || !shouldShowPreMatchPrediction(match.status)) {
    return undefined;
  }

  const homeTeam = teamsById[match.homeTeamId];
  const awayTeam = teamsById[match.awayTeamId];
  if (!homeTeam || !awayTeam) {
    return undefined;
  }
  const homeBaseline = baselineProbabilitiesByTeamId.get(homeTeam.id)?.roundOf32;
  const awayBaseline = baselineProbabilitiesByTeamId.get(awayTeam.id)?.roundOf32;
  if (typeof homeBaseline !== "number" || typeof awayBaseline !== "number") {
    return undefined;
  }

  const scenarios = stakesScenarios.map((scenario) => {
    const score = likelyScenarioScore(scenario.key, homeTeam, awayTeam);
    const conditionalFixtures = fixtureList.map((fixture) =>
      fixture.id === match.id
        ? {
            ...fixture,
            status: "FT",
            homeGoals: score.homeGoals,
            awayGoals: score.awayGoals
          }
        : fixture
    );
    const forecast = (runMonteCarlo as unknown as (options: {
      simulations: number;
      teamList: AppTeam[];
      fixtureList: AppFixture[];
      seed: string;
    }) => ForecastResult)({
      simulations: stakesSimulationCount,
      teamList,
      fixtureList: conditionalFixtures,
      seed: buildForecastSeed({
        mode: `stakes:${match.id}:${scenario.key}`,
        simulationCount: stakesSimulationCount,
        fixtureList: conditionalFixtures
      })
    });
    const homeProjection = forecast.probabilities.find((row) => row.teamId === match.homeTeamId);
    const awayProjection = forecast.probabilities.find((row) => row.teamId === match.awayTeamId);
    const homeRoundOf32 = homeProjection?.roundOf32 ?? 0;
    const awayRoundOf32 = awayProjection?.roundOf32 ?? 0;

    return {
      key: scenario.key,
      label: scenarioLabel(scenario.key, homeTeam.id, awayTeam.id),
      homeRoundOf32,
      awayRoundOf32,
      homeRoundOf32Delta: homeRoundOf32 - homeBaseline,
      awayRoundOf32Delta: awayRoundOf32 - awayBaseline
    };
  });

  return {
    simulations: stakesSimulationCount,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    scenarios
  };
}

function scenarioLabel(key: MatchStakesScenario["key"], homeId: string, awayId: string) {
  if (key === "homeWin") return `${homeId} win`;
  if (key === "awayWin") return `${awayId} win`;
  return "Draw";
}

function deltaTone(delta: number) {
  if (delta > 0.004) return "up";
  if (delta < -0.004) return "down";
  return "flat";
}

function likelyScenarioScore(key: MatchStakesScenario["key"], homeTeam: AppTeam, awayTeam: AppTeam) {
  const prediction = predictMatch(homeTeam, awayTeam, { scorelineCount: 121 });
  const scoreline = prediction.scorelines.find((candidate) => {
    if (key === "homeWin") return candidate.homeGoals > candidate.awayGoals;
    if (key === "awayWin") return candidate.awayGoals > candidate.homeGoals;
    return candidate.homeGoals === candidate.awayGoals;
  });

  if (scoreline) {
    return {
      homeGoals: scoreline.homeGoals,
      awayGoals: scoreline.awayGoals
    };
  }

  if (key === "homeWin") return { homeGoals: 1, awayGoals: 0 };
  if (key === "awayWin") return { homeGoals: 0, awayGoals: 1 };
  return { homeGoals: 1, awayGoals: 1 };
}

function buildForecastSeed({
  mode,
  simulationCount,
  fixtureList
}: {
  mode: string;
  simulationCount: number;
  fixtureList: AppFixture[];
}) {
  const fixtureState = fixtureList
    .map((fixture) =>
      [
        fixture.id,
        fixture.status,
        fixture.homeTeamId,
        fixture.awayTeamId,
        fixture.homeGoals ?? "",
        fixture.awayGoals ?? ""
      ].join(":")
    )
    .join("|");

  return `${mode}:${simulationCount}:${fixtureState}`;
}

function groupProjectedStandings(rows: GroupProjectionRow[]) {
  const groups = [...new Set(rows.map((row) => row.group))].sort();
  return groups.map((group) => rows.filter((row) => row.group === group));
}

function topTwoProbability(row: GroupProjectionRow) {
  return (row.rankProbabilities[0] ?? 0) + (row.rankProbabilities[1] ?? 0);
}

function formatRounded(value: number) {
  return String(Math.round(value));
}

function formatSignedRounded(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function groupLabels(teamList: AppTeam[]) {
  return [...new Set(teamList.map((team) => team.group))].sort();
}

function fixtureDetailText(match: AppFixture, viewerTimeZone: string) {
  return match.status === "FT"
    ? "No scorer data"
    : `${match.venue} · ${formatKickoffTime(match.kickoff, viewerTimeZone)}`;
}

function goalScorerKey(scorer: MatchScorer, index: number) {
  return `${scorer.teamId}-${scorer.player}-${scorer.minute}-${scorer.stoppageMinute ?? 0}-${index}`;
}

function visibleGoalScorers(match: AppFixture) {
  const seen = new Set<string>();

  return match.scorers.filter((scorer) => {
    if (isShootoutPenaltyScorer(match, scorer)) return false;

    const key = [
      scorer.teamId,
      scorer.player,
      scorer.minute,
      scorer.stoppageMinute ?? 0,
      scorer.eventType ?? "goal"
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isShootoutPenaltyScorer(match: AppFixture, scorer: MatchScorer) {
  return hasPenaltyShootout(match) && scorer.eventType === "penalty_goal" && scorer.minute >= 120;
}

function hasPenaltyShootout(match: AppFixture) {
  return typeof match.homePenalties === "number" && typeof match.awayPenalties === "number";
}

function compareScorers(left: MatchScorer, right: MatchScorer) {
  if (left.minute !== right.minute) return left.minute - right.minute;
  return (left.stoppageMinute ?? 0) - (right.stoppageMinute ?? 0);
}

function groupGoalScorers(scorers: MatchScorer[]) {
  const groups = new Map<string, { key: string; teamId: string; player: string; events: MatchScorer[] }>();

  scorers
    .slice()
    .sort(compareScorers)
    .forEach((scorer) => {
      const key = `${scorer.teamId}-${scorer.player}`;
      const group = groups.get(key) ?? { key, teamId: scorer.teamId, player: scorer.player, events: [] };
      group.events.push(scorer);
      groups.set(key, group);
    });

  return [...groups.values()];
}

function scorerBadge(scorer: MatchScorer) {
  if (scorer.eventType === "penalty_goal") return "PEN";
  if (scorer.eventType === "own_goal") return "OG";
  return "";
}

function eventSideClass(match: AppFixture, teamId: string) {
  if (teamId === match.homeTeamId) return "home";
  if (teamId === match.awayTeamId) return "away";
  return "";
}

function teamCodeForEvent(teamId: string, teamsById: Record<string, AppTeam>) {
  return teamsById[teamId]?.id ?? teamId;
}

function shootoutAttemptsForDisplay(match: AppFixture) {
  if (!hasPenaltyShootout(match)) return [];

  const deduped = new Map<string, AppFixture["shootoutEvents"][number]>();
  match.shootoutEvents.forEach((attempt) => {
    const key = `${attempt.teamId}-${attempt.player}-${attempt.eventType}`;
    const existing = deduped.get(key);
    if (!existing || (!existing.stoppageMinute && attempt.stoppageMinute)) {
      deduped.set(key, attempt);
    }
  });

  return [...deduped.values()].sort((left, right) => {
    const order = (left.stoppageMinute ?? 0) - (right.stoppageMinute ?? 0);
    const sideOrder = sideSortValue(match, left.teamId) - sideSortValue(match, right.teamId);
    if (order !== 0) return order;
    if (sideOrder !== 0) return sideOrder;
    return left.player.localeCompare(right.player);
  });
}

function shootoutAttemptNumber(attempt: AppFixture["shootoutEvents"][number], index: number) {
  if (typeof attempt.stoppageMinute === "number" && attempt.stoppageMinute > 0) {
    return attempt.stoppageMinute;
  }
  return Math.floor(index / 2) + 1;
}

function shootoutAttemptLabel(attempt: AppFixture["shootoutEvents"][number], index: number) {
  const order = shootoutAttemptNumber(attempt, index);
  return `${order} shootout taker ${attempt.eventType === "penalty_goal" ? "scored" : "missed"}`;
}

function sideSortValue(match: AppFixture, teamId: string) {
  if (teamId === match.homeTeamId) return 0;
  if (teamId === match.awayTeamId) return 1;
  return 2;
}

function shootoutAttemptsSummary(match: AppFixture, attempts: AppFixture["shootoutEvents"]) {
  const made = attempts.filter((attempt) => attempt.eventType === "penalty_goal").length;
  const missed = attempts.filter((attempt) => attempt.eventType === "penalty_miss").length;
  const total = made + missed;

  if (total === 0 && hasPenaltyShootout(match)) return `PK ${match.homePenalties}-${match.awayPenalties}`;
  if (missed === 0) return `${made} scored kicks`;
  return `${made}/${total} logged`;
}

function penaltyShootoutSummary(match: AppFixture, teamsById: Record<string, AppTeam>) {
  if (!hasPenaltyShootout(match)) return null;

  const homePenalties = match.homePenalties as number;
  const awayPenalties = match.awayPenalties as number;
  const score = `PK ${homePenalties}-${awayPenalties}`;
  const winningTeamId =
    homePenalties > awayPenalties
      ? match.homeTeamId
      : awayPenalties > homePenalties
        ? match.awayTeamId
        : null;

  return {
    score,
    label: winningTeamId
      ? `${teamName(winningTeamId, teamsById)} advances on penalties`
      : "Penalty shootout"
  };
}

function scoreCell(match: AppFixture, side: "home" | "away") {
  const goals = side === "home" ? match.homeGoals : match.awayGoals;
  return displayFixtureScore(match.status, goals);
}

function isGroupFixture(match: AppFixture): match is AppFixture & {
  group: string;
  homeTeamId: string;
  awayTeamId: string;
} {
  return match.stage === "group" && Boolean(match.group && match.homeTeamId && match.awayTeamId);
}

function slotLabel(slot: string) {
  if (/^[12][A-L]$/.test(slot)) return `Group ${slot.slice(1)} #${slot[0]}`;
  if (slot.startsWith("W")) return `Winner Match ${slot.slice(1)}`;
  if (slot.startsWith("L")) return `Loser Match ${slot.slice(1)}`;
  if (slot.startsWith("3 ")) return `Best 3rd (${slot.slice(2)})`;
  return slot;
}
function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function teamName(teamId: string, teamsById: Record<string, AppTeam>) {
  return teamsById[teamId]?.name ?? teamId;
}

function teamFlag(teamId: string, teamsById: Record<string, AppTeam>) {
  return teamsById[teamId]?.flagEmoji ?? flags[teamId] ?? "◦";
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function drawBracketConnectors(stage: HTMLDivElement | null) {
  const svg = stage?.querySelector<SVGSVGElement>(".bracket-connectors");
  const columns = [...(stage?.querySelectorAll<HTMLElement>(".tree-round") ?? [])];
  if (!stage || !svg || columns.length < 2) return;

  const stageRect = stage.getBoundingClientRect();
  const paths: string[] = [];

  for (let columnIndex = 0; columnIndex < columns.length - 1; columnIndex += 1) {
    const sourceCards = [...columns[columnIndex].querySelectorAll<HTMLElement>(".bracket-match")];
    const targetCards = [...columns[columnIndex + 1].querySelectorAll<HTMLElement>(".bracket-match")];

    targetCards.forEach((target, targetIndex) => {
      const topSource = sourceCards[targetIndex * 2];
      const bottomSource = sourceCards[targetIndex * 2 + 1];
      if (!topSource || !bottomSource) return;

      const topRect = topSource.getBoundingClientRect();
      const bottomRect = bottomSource.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = topRect.right - stageRect.left + stage.scrollLeft;
      const topY = topRect.top + topRect.height / 2 - stageRect.top;
      const bottomY = bottomRect.top + bottomRect.height / 2 - stageRect.top;
      const endX = targetRect.left - stageRect.left + stage.scrollLeft;
      const endY = targetRect.top + targetRect.height / 2 - stageRect.top;
      const midX = startX + Math.max(24, (endX - startX) / 2);

      paths.push(
        `M ${startX} ${topY} H ${midX} V ${bottomY} H ${startX} M ${midX} ${
          (topY + bottomY) / 2
        } V ${endY} H ${endX}`
      );
    });
  }

  svg.setAttribute("viewBox", `0 0 ${stage.scrollWidth} ${stage.scrollHeight}`);
  svg.setAttribute("width", String(stage.scrollWidth));
  svg.setAttribute("height", String(stage.scrollHeight));
  svg.innerHTML = paths.map((path) => `<path d="${path}" />`).join("");
}
