"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildGroupTable,
  fixtures as fixtureSeed,
  predictMatch,
  rankGroup,
  runMonteCarlo,
  teams as teamSeed
} from "@wc/tournament-engine";
import type { AppFixture, AppTeam, TournamentData } from "@/lib/tournament-data";
import { displayFixtureScore, shouldShowPreMatchPrediction } from "@/lib/fixture-presentation";
import {
  formatDataLoadedAt,
  LIVE_REFRESH_INTERVAL_MS,
  shouldShowDataLoadedAt,
  shouldRefreshLiveData
} from "@/lib/live-refresh";
import { buildOutcomePresentation } from "@/lib/prediction-presentation";
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
type ForecastResult = {
  simulations: number;
  probabilities: ProbabilityRow[];
  sampleBracket: {
    groupRankings: StandingRow[][];
    rounds: Record<string, KnockoutMatch[]>;
    teamFinishes: Record<string, string>;
  };
};

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
  ENG: "🏴",
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
  SCO: "🏴",
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
  const projectedStandings = forecast?.sampleBracket.groupRankings ?? [];
  const thirdPlaceMatch = forecast?.sampleBracket.rounds["Third place"]?.[0];
  const selectedTeam = forecast?.probabilities.find(
    (team) => team.teamId === (selectedTeamId ?? forecast.probabilities[0]?.teamId)
  );

  function runForecast() {
    const fixtureList =
      mode === "pre"
        ? simulationFixtures.map(({ homeGoals, awayGoals, ...match }) => match)
        : simulationFixtures;
    const result = (runMonteCarlo as unknown as (options: {
      simulations: number;
      teamList: AppTeam[];
      fixtureList: AppFixture[];
    }) => ForecastResult)({
      simulations: simulationCount,
      teamList: teams,
      fixtureList
    });
    setForecast(result);
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
          {(["fixtures", "standings", "bracket", "forecast"] as TabName[]).map((tab) => (
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
            <p className="eyebrow">Scores, fixtures, bracket, forecast</p>
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
                <div className="standings-grid">
                  {projectedStandings.map((rows) => (
                    <StandingTable key={rows[0].group} rows={rows} teamsById={teamsById} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "bracket" && forecast && (
          <section className="tab-panel active">
            <div className="panel bracket-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Knockout path</p>
                  <h2>Projected Bracket</h2>
                </div>
                <span>Sample scores from the latest forecast</span>
              </div>
              <div ref={bracketRef} className="bracket-stage">
                <svg className="bracket-connectors" aria-hidden="true" />
                <div className="bracket-columns">
                  {roundOrder.map((round) => (
                    <div key={round} className="round tree-round">
                      <h3>{round}</h3>
                      {(forecast.sampleBracket.rounds[round] ?? []).map((match, index) => {
                        const meta = bracketRoundMeta[round];
                        return (
                          <article
                            key={match.id}
                            className="bracket-match"
                            style={{ "--row-start": index * meta.interval + meta.offset } as React.CSSProperties}
                          >
                            <div className="match-location">
                              {match.stadium}, {match.venue} · M{match.id}
                            </div>
                            {match.teamIds.map((teamId) => (
                              <div
                                key={teamId}
                                className={`match-chip ${match.winnerId === teamId ? "winner" : ""}`}
                              >
                                <span>
                                  {teamFlag(teamId, teamsById)} {teamName(teamId, teamsById)}
                                </span>
                                <span>{match.score?.[teamId] ?? "-"}</span>
                              </div>
                            ))}
                            {match.wentToPenalties && <div className="penalty-note">Advanced after penalties</div>}
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              {thirdPlaceMatch && (
                <div className="third-place-bracket">
                  <h3>Third place</h3>
                  <article className="bracket-match">
                    <div className="match-location">
                      {thirdPlaceMatch.stadium}, {thirdPlaceMatch.venue} · M{thirdPlaceMatch.id}
                    </div>
                    {thirdPlaceMatch.teamIds.map((teamId) => (
                      <div
                        key={teamId}
                        className={`match-chip ${thirdPlaceMatch.winnerId === teamId ? "winner" : ""}`}
                      >
                        <span>
                          {teamFlag(teamId, teamsById)} {teamName(teamId, teamsById)}
                        </span>
                        <span>{thirdPlaceMatch.score?.[teamId] ?? "-"}</span>
                      </div>
                    ))}
                    {thirdPlaceMatch.wentToPenalties && (
                      <div className="penalty-note">Advanced after penalties</div>
                    )}
                  </article>
                </div>
              )}
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
  isToday
}: {
  match: AppFixture;
  teamsById: Record<string, AppTeam>;
  viewerTimeZone: string;
  isToday: boolean;
}) {
  const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
  const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
  const prediction =
    shouldShowPreMatchPrediction(match.status) &&
    Number.isFinite(homeTeam?.rating) &&
    Number.isFinite(awayTeam?.rating)
      ? predictMatch(homeTeam, awayTeam)
      : undefined;
  const outcomes = prediction && homeTeam && awayTeam
    ? buildOutcomePresentation({
        homeName: homeTeam.name,
        awayName: awayTeam.name,
        probabilities: prediction.probabilities
      })
    : [];

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
      </div>
      <div className="scorers">{scorerText(match, viewerTimeZone)}</div>
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
  return (
    <div className="score-row">
      <span className="team-inline">
        <span className="flag-badge">{teamId ? teamFlag(teamId, teamsById) : "·"}</span>
        {teamId ? teamName(teamId, teamsById) : slotLabel(slot)}
      </span>
      <span className="score">{score}</span>
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

function groupLabels(teamList: AppTeam[]) {
  return [...new Set(teamList.map((team) => team.group))].sort();
}

function scorerText(match: AppFixture, viewerTimeZone: string) {
  if (!match.scorers.length) {
    return match.status === "FT"
      ? "No scorer data"
      : `${match.venue} · ${formatKickoffTime(match.kickoff, viewerTimeZone)}`;
  }

  return match.scorers.map((scorer) => `${scorer.player} ${scorer.minute}'`).join(" · ");
}

function scoreCell(match: AppFixture, side: "home" | "away") {
  const goals = side === "home" ? match.homeGoals : match.awayGoals;
  const penalties = side === "home" ? match.homePenalties : match.awayPenalties;
  const score = displayFixtureScore(match.status, goals);
  return typeof score === "number" && typeof penalties === "number" ? `${score} (${penalties})` : score;
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
