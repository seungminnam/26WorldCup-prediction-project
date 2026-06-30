import { fixtures } from "/src/data/fixtures.js";
import { teams } from "/src/data/teams.js";
import { buildGroupTable, rankGroup } from "/src/engine/ranking.js";
import { runMonteCarlo } from "/src/engine/simulator.js";

const tabTriggers = document.querySelectorAll(".tab-trigger");
const tabPanels = document.querySelectorAll(".tab-panel");
const runButton = document.querySelector("#run-button");
const simulationCount = document.querySelector("#simulation-count");
const modeSelect = document.querySelector("#mode");
const runSummary = document.querySelector("#run-summary");
const favorites = document.querySelector("#favorites");
const probabilityBody = document.querySelector("#probability-body");
const bracketStage = document.querySelector("#bracket-stage");
const teamDetail = document.querySelector("#team-detail");
const dayPills = document.querySelector("#day-pills");
const matchList = document.querySelector("#match-list");
const currentStandings = document.querySelector("#current-standings");
const projectedStandings = document.querySelector("#projected-standings");

const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]));
const flagById = {
  ARG: "🇦🇷",
  ALG: "🇩🇿",
  AUS: "🇦🇺",
  AUT: "🇦🇹",
  BEL: "🇧🇪",
  BIH: "🇧🇦",
  BOL: "🇧🇴",
  BRA: "🇧🇷",
  CAN: "🇨🇦",
  CIV: "🇨🇮",
  COD: "🇨🇩",
  COL: "🇨🇴",
  CPV: "🇨🇻",
  CRC: "🇨🇷",
  CRO: "🇭🇷",
  CZE: "🇨🇿",
  CUW: "🇨🇼",
  DEN: "🇩🇰",
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
  ITA: "🇮🇹",
  JAM: "🇯🇲",
  JOR: "🇯🇴",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  KSA: "🇸🇦",
  MAR: "🇲🇦",
  MEX: "🇲🇽",
  NED: "🇳🇱",
  NGA: "🇳🇬",
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
  UAE: "🇦🇪",
  URU: "🇺🇾",
  USA: "🇺🇸",
  UZB: "🇺🇿"
};

let latestResult;
let selectedTeamId;
let selectedDateKey;

const bracketRoundMeta = {
  "Round of 32": { interval: 4, offset: 1 },
  "Round of 16": { interval: 8, offset: 3 },
  Quarterfinal: { interval: 16, offset: 7 },
  Semifinal: { interval: 32, offset: 15 },
  Final: { interval: 64, offset: 31 }
};

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function teamName(teamId) {
  return teamsById[teamId]?.name ?? teamId;
}

function teamFlag(teamId) {
  return flagById[teamId] ?? "◦";
}

function setActiveTab(tabName) {
  tabTriggers.forEach((trigger) => {
    trigger.classList.toggle("active", trigger.dataset.tab === tabName);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
  history.replaceState(null, "", `#${tabName}`);
}

function dateKey(kickoff) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(kickoff));
}

function shortDate(kickoff) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(kickoff));
}

function timeLabel(kickoff) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(kickoff));
}

function renderDayPills() {
  const days = [...new Set(fixtures.map((match) => dateKey(match.kickoff)))].sort();
  selectedDateKey ??= days[0];

  dayPills.innerHTML = days
    .map((day) => {
      const dayMatches = fixtures.filter((match) => dateKey(match.kickoff) === day);
      return `
        <button class="day-pill ${day === selectedDateKey ? "active" : ""}" type="button" data-date="${day}">
          <span>${dayMatches.length} matches</span>
          <strong>${shortDate(dayMatches[0].kickoff)}</strong>
        </button>
      `;
    })
    .join("");
}

function scorerText(match) {
  return match.status === "FT" ? "No scorer data" : `${match.venue} · ${timeLabel(match.kickoff)}`;
}

function formatMatchMinute(event) {
  const stoppageMinute = Number(event.stoppageMinute ?? 0);
  return stoppageMinute > 0 ? `${event.minute}+${stoppageMinute}'` : `${event.minute}'`;
}

function hasPenaltyShootout(match) {
  return Number.isFinite(match.homePenalties) && Number.isFinite(match.awayPenalties);
}

function isShootoutPenaltyScorer(match, scorer) {
  return hasPenaltyShootout(match) && scorer.eventType === "penalty_goal" && scorer.minute >= 120;
}

function visibleGoalScorers(match) {
  const seen = new Set();

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

function groupGoalScorers(scorers) {
  const groups = new Map();

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

function compareScorers(left, right) {
  if (left.minute !== right.minute) return left.minute - right.minute;
  return (left.stoppageMinute ?? 0) - (right.stoppageMinute ?? 0);
}

function scorerBadge(scorer) {
  if (scorer.eventType === "penalty_goal") return "PEN";
  if (scorer.eventType === "own_goal") return "OG";
  return "";
}

function eventSideClass(match, teamId) {
  if (teamId === match.homeTeamId) return "home";
  if (teamId === match.awayTeamId) return "away";
  return "";
}

function shootoutAttemptsForDisplay(match) {
  if (!hasPenaltyShootout(match)) return [];

  const deduped = new Map();
  (match.shootoutEvents ?? []).forEach((attempt) => {
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

function sideSortValue(match, teamId) {
  if (teamId === match.homeTeamId) return 0;
  if (teamId === match.awayTeamId) return 1;
  return 2;
}

function shootoutAttemptsSummary(match, attempts) {
  const made = attempts.filter((attempt) => attempt.eventType === "penalty_goal").length;
  const missed = attempts.filter((attempt) => attempt.eventType === "penalty_miss").length;
  const total = made + missed;

  if (total === 0 && hasPenaltyShootout(match)) return `PK ${match.homePenalties}-${match.awayPenalties}`;
  if (missed === 0) return `${made} scored kicks`;
  return `${made}/${total} logged`;
}

function penaltyShootoutSummary(match) {
  if (!hasPenaltyShootout(match)) return "";

  const winningTeamId =
    match.homePenalties > match.awayPenalties
      ? match.homeTeamId
      : match.awayPenalties > match.homePenalties
        ? match.awayTeamId
        : null;
  const label = winningTeamId ? `${teamName(winningTeamId)} advances on penalties` : "Penalty shootout";

  return `
    <div class="shootout-summary" aria-label="${label}">
      <span>PK ${match.homePenalties}-${match.awayPenalties}</span>
      <strong>${label}</strong>
    </div>
  `;
}

function fixtureEventPanel(match) {
  const goalGroups = groupGoalScorers(visibleGoalScorers(match));
  const visibleGoalGroups = goalGroups.slice(0, 4);
  const hiddenGoalCount = goalGroups.length - visibleGoalGroups.length;
  const shootoutAttempts = shootoutAttemptsForDisplay(match);

  if (!goalGroups.length && !shootoutAttempts.length) {
    return `
      <div class="fixture-events empty">
        <span>Details</span>
        <strong>${scorerText(match)}</strong>
      </div>
    `;
  }

  return `
    <div class="fixture-events">
      ${
        goalGroups.length
          ? `
            <div class="fixture-events-heading">
              <span>Goals</span>
              ${hiddenGoalCount > 0 ? `<span class="fixture-more-count">+${hiddenGoalCount} more</span>` : ""}
            </div>
            <div class="fixture-event-list" aria-label="Goal events">
              ${visibleGoalGroups
                .map(
                  (group) => `
                    <div class="fixture-event ${eventSideClass(match, group.teamId)}">
                      <span class="event-minutes">
                        ${group.events
                          .map((scorer) => {
                            const badge = scorerBadge(scorer);
                            return `
                              <span class="event-minute">
                                ${formatMatchMinute(scorer)}
                                ${badge ? `<em>${badge}</em>` : ""}
                              </span>
                            `;
                          })
                          .join("")}
                      </span>
                      <span class="event-team-code">${group.teamId}</span>
                      <strong>${group.player}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        shootoutAttempts.length
          ? `
            <div class="shootout-disclosure">
              <button type="button" aria-expanded="false" data-shootout-toggle>
                <span>Shootout</span>
                <strong>${shootoutAttemptsSummary(match, shootoutAttempts)}</strong>
                <i aria-hidden="true">+</i>
              </button>
              <div class="shootout-attempts" aria-label="Penalty shootout attempts" hidden>
                ${shootoutAttempts
                  .map(
                    (attempt) => `
                      <div class="shootout-attempt ${eventSideClass(match, attempt.teamId)} ${attempt.eventType}">
                        <span>${attempt.eventType === "penalty_goal" ? "✓" : "×"}</span>
                        <strong>${attempt.player}</strong>
                        <em>${attempt.teamId}</em>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function scoreCell(match, side) {
  const goals = side === "home" ? match.homeGoals : match.awayGoals;
  return match.status === "FT" && Number.isFinite(goals) ? goals : "-";
}

function completedFixtures(fixtureList = fixtures) {
  return fixtureList.filter(
    (match) =>
      match.status === "FT" &&
      Number.isFinite(match.homeGoals) &&
      Number.isFinite(match.awayGoals)
  );
}

function renderMatchCentre() {
  renderDayPills();

  const visibleMatches = fixtures
    .filter((match) => dateKey(match.kickoff) === selectedDateKey)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  matchList.innerHTML = `
    <div class="date-divider">${shortDate(visibleMatches[0].kickoff)}</div>
    ${visibleMatches
      .map(
        (match) => `
          <article class="fixture-card">
            <div class="match-meta">
              <span class="status ${match.status === "FT" ? "ft" : ""}">${match.status}</span>
              <span>Match ${match.matchNumber}</span>
              <span>${match.venue}</span>
            </div>
            <div class="teams-score">
              <div class="score-row">
                <div class="team-column">
                  <span class="team-inline">
                    <span class="flag-badge">${teamFlag(match.homeTeamId)}</span>
                    <span class="team-name">${teamName(match.homeTeamId)}</span>
                  </span>
                </div>
                <span class="score">${scoreCell(match, "home")}</span>
              </div>
              <div class="score-row">
                <div class="team-column">
                  <span class="team-inline">
                    <span class="flag-badge">${teamFlag(match.awayTeamId)}</span>
                    <span class="team-name">${teamName(match.awayTeamId)}</span>
                  </span>
                </div>
                <span class="score">${scoreCell(match, "away")}</span>
              </div>
              ${penaltyShootoutSummary(match)}
            </div>
            ${fixtureEventPanel(match)}
          </article>
        `
      )
      .join("")}
  `;

  matchList.querySelectorAll("[data-shootout-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const attempts = button.parentElement?.querySelector(".shootout-attempts");
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.querySelector("i").textContent = expanded ? "+" : "−";
      if (attempts) attempts.hidden = expanded;
    });
  });
}

function groupLabels() {
  return [...new Set(teams.map((team) => team.group))].sort();
}

function renderStandingTable(group, rows) {
  return `
    <article class="standing-card">
      <h3>Group ${group}</h3>
      <table class="mini-table">
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
          ${rows
            .map(
              (row, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td><span class="team-name compact">${teamFlag(row.teamId)} ${teamName(row.teamId)}</span></td>
                  <td>${row.played}</td>
                  <td><strong>${row.points}</strong></td>
                  <td>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td>
                  <td>${row.goalsFor}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderCurrentStandings() {
  currentStandings.innerHTML = groupLabels()
    .map((group) => {
      const groupTeams = teams.filter((team) => team.group === group);
      const groupFixtures = completedFixtures().filter((match) => match.group === group);
      return renderStandingTable(group, rankGroup(buildGroupTable(groupTeams, groupFixtures)));
    })
    .join("");
}

function renderProjectedStandings(result) {
  if (!result) {
    projectedStandings.innerHTML = "";
    return;
  }

  projectedStandings.innerHTML = result.sampleBracket.groupRankings
    .map((rows) => renderStandingTable(rows[0].group, rows))
    .join("");
}

function renderFavorites(probabilities) {
  favorites.innerHTML = probabilities
    .slice(0, 4)
    .map(
      (team, index) => `
        <article class="favorite-card">
          <span class="eyebrow">#${index + 1} title odds</span>
          <strong><span>${teamFlag(team.teamId)}</span> ${team.name}</strong>
          <div class="metric">
            <span>Champion</span>
            <b>${formatPercent(team.champion)}</b>
          </div>
          <div class="bar" aria-hidden="true">
            <span style="width: ${Math.max(3, team.champion * 100)}%"></span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTable(probabilities) {
  probabilityBody.innerHTML = probabilities
    .map(
      (team) => `
        <tr data-team-id="${team.teamId}" class="${team.teamId === selectedTeamId ? "selected" : ""}">
          <td>
            <span class="team-name">
              <span class="flag-badge">${teamFlag(team.teamId)}</span>
              ${team.name}
            </span>
          </td>
          <td><span class="group-chip">${team.group}</span></td>
          <td>${formatPercent(team.roundOf32)}</td>
          <td>${formatPercent(team.roundOf16)}</td>
          <td>${formatPercent(team.quarterfinal)}</td>
          <td>${formatPercent(team.semifinal)}</td>
          <td>${formatPercent(team.final)}</td>
          <td><strong>${formatPercent(team.champion)}</strong></td>
        </tr>
      `
    )
    .join("");
}

function roundOrder(rounds) {
  return ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"].filter(
    (round) => rounds[round]
  );
}

function roundVenue(index) {
  const venues = ["Los Angeles", "Dallas", "Atlanta", "Miami", "Vancouver", "Boston"];
  return venues[index % venues.length];
}

function renderBracket(sampleBracket) {
  const rounds = roundOrder(sampleBracket.rounds);
  bracketStage.innerHTML = `
    <svg class="bracket-connectors" aria-hidden="true"></svg>
    <div class="bracket-columns">
      ${rounds
    .map(
      (round) => `
        <div class="round tree-round">
          <h3>${round}</h3>
          ${sampleBracket.rounds[round]
            .map((match, index) => {
              const meta = bracketRoundMeta[round];
              const start = index * meta.interval + meta.offset + 1;
              return `
                <article class="bracket-match" style="--row-start: ${start}">
                  <div class="match-location">${roundVenue(index)} · ${match.id}</div>
                  ${match.teamIds
                    .map(
                      (teamId) => `
                        <div class="match-chip ${match.winnerId === teamId ? "winner" : ""}">
                          <span>${teamFlag(teamId)} ${teamName(teamId)}</span>
                          <span>${match.score?.[teamId] ?? "-"}</span>
                        </div>
                      `
                    )
                    .join("")}
                  ${match.wentToPenalties ? '<div class="penalty-note">Advanced after penalties</div>' : ""}
                </article>
              `;
            })
            .join("")}
        </div>
      `
    )
    .join("")}
    </div>
  `;

  requestAnimationFrame(drawBracketConnectors);
}

function drawBracketConnectors() {
  const svg = bracketStage.querySelector(".bracket-connectors");
  const columns = [...bracketStage.querySelectorAll(".tree-round")];
  if (!svg || columns.length < 2) return;

  const stageRect = bracketStage.getBoundingClientRect();
  const width = bracketStage.scrollWidth;
  const height = bracketStage.scrollHeight;
  const paths = [];

  for (let columnIndex = 0; columnIndex < columns.length - 1; columnIndex += 1) {
    const sourceCards = [...columns[columnIndex].querySelectorAll(".bracket-match")];
    const targetCards = [...columns[columnIndex + 1].querySelectorAll(".bracket-match")];

    targetCards.forEach((target, targetIndex) => {
      const topSource = sourceCards[targetIndex * 2];
      const bottomSource = sourceCards[targetIndex * 2 + 1];
      if (!topSource || !bottomSource) return;

      const topRect = topSource.getBoundingClientRect();
      const bottomRect = bottomSource.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = topRect.right - stageRect.left + bracketStage.scrollLeft;
      const topY = topRect.top + topRect.height / 2 - stageRect.top;
      const bottomY = bottomRect.top + bottomRect.height / 2 - stageRect.top;
      const endX = targetRect.left - stageRect.left + bracketStage.scrollLeft;
      const endY = targetRect.top + targetRect.height / 2 - stageRect.top;
      const midX = startX + Math.max(24, (endX - startX) / 2);

      paths.push(
        `M ${startX} ${topY} H ${midX} V ${bottomY} H ${startX} M ${midX} ${
          (topY + bottomY) / 2
        } V ${endY} H ${endX}`
      );
    });
  }

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.innerHTML = paths.map((path) => `<path d="${path}" />`).join("");
}

function renderTeamDetail(teamId) {
  selectedTeamId = teamId;

  if (!latestResult || !teamId) {
    teamDetail.className = "team-detail empty-state";
    teamDetail.textContent = "Select a team from the forecast table.";
    return;
  }

  const row = latestResult.probabilities.find((team) => team.teamId === teamId);
  const sampleFinish = latestResult.sampleBracket.teamFinishes[teamId] ?? "Group Stage";

  teamDetail.className = "team-detail";
  teamDetail.innerHTML = `
    <div>
      <p class="eyebrow">Group ${row.group}</p>
      <h3>${teamFlag(teamId)} ${row.name}</h3>
    </div>
    <div class="route-list">
      <div class="route-row"><span>Sample finish</span><strong>${sampleFinish}</strong></div>
      <div class="route-row"><span>Round of 32</span><strong>${formatPercent(row.roundOf32)}</strong></div>
      <div class="route-row"><span>Quarterfinal</span><strong>${formatPercent(row.quarterfinal)}</strong></div>
      <div class="route-row"><span>Final</span><strong>${formatPercent(row.final)}</strong></div>
      <div class="route-row"><span>Champion</span><strong>${formatPercent(row.champion)}</strong></div>
    </div>
  `;

  renderTable(latestResult.probabilities);
}

function render(result) {
  latestResult = result;
  const modeLabel = modeSelect.selectedOptions[0].textContent;
  runSummary.textContent = `${result.simulations.toLocaleString()} runs · ${modeLabel}`;

  renderFavorites(result.probabilities);
  renderTable(result.probabilities);
  renderBracket(result.sampleBracket);
  renderProjectedStandings(result);
  renderTeamDetail(selectedTeamId ?? result.probabilities[0].teamId);
}

async function runSimulation() {
  runButton.disabled = true;
  runButton.textContent = "Running";
  favorites.classList.add("loading");

  await new Promise((resolve) => setTimeout(resolve, 20));

  const fixtureList =
    modeSelect.value === "pre"
      ? fixtures.map(({ homeGoals, awayGoals, ...match }) => match)
      : fixtures;

  const result = runMonteCarlo({
    simulations: Number(simulationCount.value),
    fixtureList
  });

  render(result);
  favorites.classList.remove("loading");
  runButton.disabled = false;
  runButton.textContent = "Run Forecast";
}

dayPills.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]");
  if (!button) return;
  selectedDateKey = button.dataset.date;
  renderMatchCentre();
});

tabTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => setActiveTab(trigger.dataset.tab));
});

probabilityBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-team-id]");
  if (row) {
    renderTeamDetail(row.dataset.teamId);
  }
});

runButton.addEventListener("click", runSimulation);
renderCurrentStandings();
renderMatchCentre();
setActiveTab(location.hash.replace("#", "") || "fixtures");
runSimulation();
