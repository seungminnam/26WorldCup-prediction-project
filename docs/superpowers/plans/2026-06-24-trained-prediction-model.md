# Trained Prediction Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-tuned `expectedGoals`/`winProbability` baseline in `packages/tournament-engine/src/engine/predictor.js` with a Dixon-Coles model whose attack/defense parameters are fitted via maximum likelihood on real historical international match results.

**Architecture:** A pure-math Dixon-Coles module (lambda/tau/scoreline-probability) is shared by an offline training script and the runtime predictor. The training script vendors a historical CSV, filters to competitive matches, fits per-team attack/defense plus global home-advantage/rho via regularized gradient ascent, and writes a generated data file. `predictor.js` is then wired to read that file instead of `team.rating`. A separate offline evaluation script backtests the result.

**Tech Stack:** Node.js ESM, Node built-in test runner, plain JS gradient ascent (no ML/Python tooling).

## Global Constraints

- `rating` is untouched — it remains the tiebreaker sort key in `ranking.js`/`thirdPlace.js`/`simulator.js`. Only score/outcome *prediction* changes.
- Training data excludes: rows where `tournament == "Friendly"`, rows with `NA` scores, and every row where `tournament == "FIFA World Cup"` and `date >= "2026-01-01"` (the in-progress 2026 tournament itself — training must never see the matches it's about to predict, including the 48 already-played 2026 group matches already present in the dataset).
- Home advantage applies only to the literal home team's lambda, never the away team's, regardless of which argument order a function is called with.
- `ξ = 0.0001` per day for the **production model** (Task 4's real training run and Task 6's evaluation script) — recency-decay weight `exp(-ξ × daysSinceMatch)`, half-life ≈ 19 years. Task 3's own synthetic recovery test uses a different, simpler `ξ = 0.001` (≈1.9-year half-life) purely to keep that test's small synthetic dataset converging quickly — that value has no bearing on production quality, only on proving the fitting code itself is correct. The production value was chosen empirically, not by formula: training on the real ~31,000-match dataset at the originally-planned `ξ = 0.001` (caught and fixed from an earlier `0.0065` arithmetic error — see Task 3) converged cleanly but produced an implausible result on inspection (Argentina, the reigning World Cup holder, came out with *worse* fitted attack and defense than Jordan, a team that has never reached a World Cup) — sweeping `ξ` from `0.001` down to `0.00003` (1.9-year to 63-year half-life) showed a clean, monotonic trend: longer history windows produce more sensible cross-confederation comparisons, because a too-short window leaves any one confederation's recent form (e.g. a hot AFC qualifying run against weak group opponents) under-anchored against the rest of the global network. `0.0001` was chosen as a middle point that still meaningfully discounts decades-old results while fixing the Argentina/Jordan inversion; Task 6's backtest is the real, rigorous check on this choice, not this one spot-check pair — if the backtest's log-loss/Brier score don't beat the naive 1/3-1/3-1/3 baseline, this is the first hyperparameter to revisit.
- Production training/evaluation use `iterations = 20000`, not `400` — `400` was enough to avoid `NaN` but nowhere near enough to converge at the real dataset's scale (hundreds of teams' worth of attack/defense parameters, versus Task 3's 4-team synthetic test). Verified empirically: results are bit-for-bit identical at 15,000 vs. 30,000 vs. 60,000 iterations, confirming convergence well before 20,000.
- Gradients are averaged (divided by the sum of match weights), not summed, before applying the learning-rate step — raw summed gradients over a full historical dataset (tens of thousands of matches) diverge regardless of learning rate; averaging keeps the optimizer's behavior independent of dataset size.
- Training is a one-time, manually-invoked script — no scheduled job.

---

## File Structure

- Create `scripts/data/international-results.csv` — vendored CC0 dataset snapshot (already downloaded during planning; 49,478 rows, columns `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral`).
- Create `scripts/data/SOURCE.md` — provenance.
- Create `packages/tournament-engine/src/engine/dixon-coles.js` — pure math: `computeLambda`, `poissonProbability`, `tauAdjustment`, `scorelineProbability`. No team/file I/O.
- Create `scripts/lib/historical-results.mjs` — CSV loading, team-name mapping, competitive-match filtering. Used by both the training and evaluation scripts.
- Create `scripts/lib/fit-dixon-coles.mjs` — gradient-ascent MLE fitting of attack/defense/home-advantage/rho. Used by both the training and evaluation scripts.
- Create `scripts/train-prediction-model.mjs` — fits the model, writes `team-strength.js`.
- Create `packages/tournament-engine/src/data/team-strength.js` — generated output (48 teams' attack/defense + global constants).
- Create `scripts/lib/evaluation-metrics.mjs` — log loss / Brier score / accuracy for backtesting. Used by the evaluation script.
- Create `scripts/evaluate-prediction-model.mjs` — holdout backtest, writes `docs/model-evaluation-report.md`.
- Modify `packages/tournament-engine/src/engine/predictor.js` — `expectedGoals`/`winProbability`/`predictMatch`/`simulateScore`/`simulateGroupMatch` rewired onto `dixon-coles.js` + `team-strength.js`; adds `isHostNationFixture`.
- Modify `apps/web/components/match-centre/match-centre-app.tsx` — Fixtures-tab `predictMatch` call site threads `isNeutralVenue`.

---

### Task 1: Vendor The Dataset And Build The Loading/Filtering Module

**Files:**
- Create: `scripts/data/international-results.csv` (already fetched during planning — verify present, do not re-fetch)
- Create: `scripts/data/SOURCE.md`
- Create: `scripts/lib/historical-results.mjs`
- Create: `scripts/lib/historical-results.test.mjs`

**Interfaces:**
- Produces: `loadCompetitiveMatches(csvText: string) => Array<{ date: Date, homeTeamId: string, awayTeamId: string, homeGoals: number, awayGoals: number, isNeutralVenue: boolean }>` — every row already filtered, name-mapped, and typed; rows with unmappable team names are skipped (not thrown).
- Produces: `TEAM_NAME_TO_ID` (exported `Map<string,string>`) — the complete dataset-name → project-team-ID table for all 48 World Cup 2026 teams (used by both this task's filter and later tasks' "every team has enough history" assertion).

- [ ] **Step 1: Confirm the vendored CSV is present and write the source note**

```bash
wc -l scripts/data/international-results.csv
```
Expected: `49478 scripts/data/international-results.csv` (or close — the live dataset grows over time; if the file is missing, re-fetch with `curl -sL -o scripts/data/international-results.csv "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"`).

Create `scripts/data/SOURCE.md`:

```markdown
# Historical Results Data Source

- Source: https://github.com/martj42/international_results
- File: `results.csv` from the `master` branch
- License: CC0-1.0 (Creative Commons Zero, public domain) — confirmed via the repo's `LICENSE` file and GitHub API license metadata
- Fetched: 2026-06-24
- Columns: `date, home_team, away_team, home_score, away_score, tournament, city, country, neutral`
- Coverage: international football results from 1872 to the present, including the in-progress 2026 FIFA World Cup (with `NA` scores for unplayed matches) — training explicitly excludes all 2026 World Cup rows; see `scripts/lib/historical-results.mjs`.
```

- [ ] **Step 2: Write the failing test for the team-name mapping and filter**

Create `scripts/lib/historical-results.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { loadCompetitiveMatches, TEAM_NAME_TO_ID } from "./historical-results.mjs";

const sampleCsv = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
1950-07-16,Brazil,Uruguay,1,2,FIFA World Cup,Rio de Janeiro,Brazil,FALSE
1990-01-01,France,England,2,2,Friendly,Paris,France,FALSE
2022-12-18,Argentina,France,3,3,FIFA World Cup,Lusail,Qatar,TRUE
2026-06-15,Mexico,South Africa,2,0,FIFA World Cup,Mexico City,Mexico,FALSE
2026-06-20,Korea Republic,Czechia,NA,NA,FIFA World Cup,Houston,United States,TRUE
2019-09-01,Atlantis,Wakanda,1,0,UEFA Euro qualification,Nowhere,Atlantis,FALSE
`;

test("excludes friendlies", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.ok(!matches.some((match) => match.homeTeamId === "FRA" && match.awayTeamId === "ENG"));
});

test("excludes every 2026 FIFA World Cup row, played or not", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.ok(!matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"));
  assert.ok(!matches.some((match) => match.homeTeamId === "KOR"));
});

test("keeps real historical competitive matches and maps team names to IDs", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  const final1950 = matches.find((match) => match.homeTeamId === "BRA" && match.awayTeamId === "URU");
  assert.ok(final1950);
  assert.equal(final1950.homeGoals, 1);
  assert.equal(final1950.awayGoals, 2);
  assert.equal(final1950.isNeutralVenue, false);

  const final2022 = matches.find((match) => match.homeTeamId === "ARG" && match.awayTeamId === "FRA");
  assert.equal(final2022.isNeutralVenue, true);
});

test("keeps competitive matches between teams outside the 48-team mapping table, using their raw dataset name as the ID", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  const nonWorldCupMatch = matches.find((match) => match.homeTeamId === "Atlantis" && match.awayTeamId === "Wakanda");
  assert.ok(
    nonWorldCupMatch,
    "a competitive match between two teams that never qualified for the 2026 World Cup must still be kept -- the fit needs the full historical network, not just intra-48-team matches"
  );
  assert.equal(nonWorldCupMatch.homeGoals, 1);
});

test("loadCompetitiveMatches keeps exactly the rows that are competitive, played, and not part of the 2026 World Cup", () => {
  const matches = loadCompetitiveMatches(sampleCsv);
  assert.equal(matches.length, 3);
});

test("TEAM_NAME_TO_ID covers every team whose project name differs from the dataset's name", () => {
  assert.equal(TEAM_NAME_TO_ID.get("South Korea"), "KOR");
  assert.equal(TEAM_NAME_TO_ID.get("Czech Republic"), "CZE");
  assert.equal(TEAM_NAME_TO_ID.get("Turkey"), "TUR");
  assert.equal(TEAM_NAME_TO_ID.get("Ivory Coast"), "CIV");
  assert.equal(TEAM_NAME_TO_ID.get("Curaçao"), "CUW");
  assert.equal(TEAM_NAME_TO_ID.get("Iran"), "IRN");
  assert.equal(TEAM_NAME_TO_ID.get("Cape Verde"), "CPV");
  assert.equal(TEAM_NAME_TO_ID.get("DR Congo"), "COD");
  assert.equal(TEAM_NAME_TO_ID.get("Mexico"), "MEX");
  assert.equal(TEAM_NAME_TO_ID.get("Brazil"), "BRA");
});
```

- [ ] **Step 3: Run the test and verify RED**

```bash
node --test scripts/lib/historical-results.test.mjs
```
Expected: FAIL — `historical-results.mjs` doesn't exist yet.

- [ ] **Step 4: Implement the loading/filtering module**

Create `scripts/lib/historical-results.mjs`:

```js
export const TEAM_NAME_TO_ID = new Map([
  ["Mexico", "MEX"],
  ["South Africa", "RSA"],
  ["South Korea", "KOR"],
  ["Czech Republic", "CZE"],
  ["Canada", "CAN"],
  ["Bosnia and Herzegovina", "BIH"],
  ["Qatar", "QAT"],
  ["Switzerland", "SUI"],
  ["Haiti", "HAI"],
  ["Scotland", "SCO"],
  ["Brazil", "BRA"],
  ["Morocco", "MAR"],
  ["United States", "USA"],
  ["Paraguay", "PAR"],
  ["Australia", "AUS"],
  ["Turkey", "TUR"],
  ["Ivory Coast", "CIV"],
  ["Ecuador", "ECU"],
  ["Germany", "GER"],
  ["Curaçao", "CUW"],
  ["Netherlands", "NED"],
  ["Japan", "JPN"],
  ["Sweden", "SWE"],
  ["Tunisia", "TUN"],
  ["Iran", "IRN"],
  ["New Zealand", "NZL"],
  ["Belgium", "BEL"],
  ["Egypt", "EGY"],
  ["Saudi Arabia", "KSA"],
  ["Uruguay", "URU"],
  ["Spain", "ESP"],
  ["Cape Verde", "CPV"],
  ["France", "FRA"],
  ["Senegal", "SEN"],
  ["Iraq", "IRQ"],
  ["Norway", "NOR"],
  ["Argentina", "ARG"],
  ["Algeria", "ALG"],
  ["Austria", "AUT"],
  ["Jordan", "JOR"],
  ["Portugal", "POR"],
  ["DR Congo", "COD"],
  ["Uzbekistan", "UZB"],
  ["Colombia", "COL"],
  ["Ghana", "GHA"],
  ["Panama", "PAN"],
  ["England", "ENG"],
  ["Croatia", "CRO"]
]);

function parseCsvLine(line) {
  return line.split(",");
}

export function loadCompetitiveMatches(csvText) {
  const lines = csvText.trim().split("\n");
  const matches = [];

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [date, homeTeam, awayTeam, homeScore, awayScore, tournament, , , neutral] = parseCsvLine(line);

    if (tournament === "Friendly") continue;
    if (tournament === "FIFA World Cup" && date >= "2026-01-01") continue;
    if (homeScore === "NA" || awayScore === "NA") continue;

    if (!homeTeam || !awayTeam) continue;
    const homeTeamId = TEAM_NAME_TO_ID.get(homeTeam) ?? homeTeam;
    const awayTeamId = TEAM_NAME_TO_ID.get(awayTeam) ?? awayTeam;

    matches.push({
      date: new Date(date),
      homeTeamId,
      awayTeamId,
      homeGoals: Number(homeScore),
      awayGoals: Number(awayScore),
      isNeutralVenue: neutral.trim() === "TRUE"
    });
  }

  return matches;
}
```

- [ ] **Step 5: Run the test and verify GREEN**

```bash
node --test scripts/lib/historical-results.test.mjs
```
Expected: all 5 tests pass.

- [ ] **Step 6: Sanity-check against the real vendored file**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { loadCompetitiveMatches, TEAM_NAME_TO_ID } from './scripts/lib/historical-results.mjs';
const matches = loadCompetitiveMatches(readFileSync('scripts/data/international-results.csv', 'utf8'));
console.log('total competitive matches:', matches.length);
const counts = new Map();
for (const m of matches) {
  counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
  counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
}
const under10 = [...TEAM_NAME_TO_ID.values()].filter((id) => (counts.get(id) ?? 0) < 10);
console.log('2026 teams with fewer than 10 historical competitive matches:', under10);
"
```
Expected: total competitive matches in the tens of thousands; `under10` is an empty array (every 2026 team has ample history). If any team comes back under 10, stop and report it — that team's name mapping is likely missing a historical alias (e.g. a former country name) and needs investigation before Task 3 can trust the fit.

- [ ] **Step 7: Commit**

```bash
git add scripts/data/international-results.csv scripts/data/SOURCE.md scripts/lib/historical-results.mjs scripts/lib/historical-results.test.mjs
git commit -m "feat: vendor historical match data and build the competitive-match loader"
```

---

### Task 2: Dixon-Coles Pure Math Module

**Files:**
- Create: `packages/tournament-engine/src/engine/dixon-coles.js`
- Create: `packages/tournament-engine/test/dixon-coles.test.js`

**Interfaces:**
- Produces: `computeLambda(attack, defense, { homeAdvantage = 0, applyHomeAdvantage = false } = {})`, `poissonProbability(goals, lambda)`, `tauAdjustment(homeGoals, awayGoals, lambdaHome, lambdaAway, rho)`, `scorelineProbability(homeGoals, awayGoals, lambdaHome, lambdaAway, rho)`. Pure functions, no imports from anywhere else in the repo — both the training script (Task 3) and `predictor.js` (Task 5) depend on this module, not on each other.

- [ ] **Step 1: Write the failing tests**

Create `packages/tournament-engine/test/dixon-coles.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { computeLambda, poissonProbability, scorelineProbability, tauAdjustment } from "../src/engine/dixon-coles.js";

test("computeLambda applies home advantage only when explicitly requested", () => {
  const withAdvantage = computeLambda(0.4, 0.1, { homeAdvantage: 0.3, applyHomeAdvantage: true });
  const withoutAdvantage = computeLambda(0.4, 0.1, { homeAdvantage: 0.3, applyHomeAdvantage: false });

  assert.equal(withoutAdvantage, Math.exp(0.4 - 0.1));
  assert.equal(withAdvantage, Math.exp(0.4 - 0.1 + 0.3));
  assert.ok(withAdvantage > withoutAdvantage);
});

test("poissonProbability matches the textbook formula", () => {
  const probability = poissonProbability(2, 1.5);
  const expected = (Math.exp(-1.5) * 1.5 ** 2) / 2;
  assert.ok(Math.abs(probability - expected) < 1e-12);
});

test("tauAdjustment matches the Dixon-Coles low-score correction exactly at each special case", () => {
  const lambdaHome = 1.2;
  const lambdaAway = 0.9;
  const rho = -0.1;

  assert.ok(Math.abs(tauAdjustment(0, 0, lambdaHome, lambdaAway, rho) - (1 - lambdaHome * lambdaAway * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(0, 1, lambdaHome, lambdaAway, rho) - (1 + lambdaHome * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(1, 0, lambdaHome, lambdaAway, rho) - (1 + lambdaAway * rho)) < 1e-12);
  assert.ok(Math.abs(tauAdjustment(1, 1, lambdaHome, lambdaAway, rho) - (1 - rho)) < 1e-12);
  assert.equal(tauAdjustment(2, 2, lambdaHome, lambdaAway, rho), 1);
  assert.equal(tauAdjustment(3, 0, lambdaHome, lambdaAway, rho), 1);
});

test("scorelineProbability multiplies the tau adjustment into the independent Poisson product", () => {
  const lambdaHome = 1.2;
  const lambdaAway = 0.9;
  const rho = -0.1;

  const probability = scorelineProbability(0, 0, lambdaHome, lambdaAway, rho);
  const expected =
    (1 - lambdaHome * lambdaAway * rho) * poissonProbability(0, lambdaHome) * poissonProbability(0, lambdaAway);

  assert.ok(Math.abs(probability - expected) < 1e-12);
});

test("scorelineProbability with rho=0 reduces to the plain independent-Poisson product", () => {
  const probability = scorelineProbability(1, 2, 1.1, 0.8, 0);
  const expected = poissonProbability(1, 1.1) * poissonProbability(2, 0.8);
  assert.ok(Math.abs(probability - expected) < 1e-12);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test packages/tournament-engine/test/dixon-coles.test.js
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the module**

Create `packages/tournament-engine/src/engine/dixon-coles.js`:

```js
export function computeLambda(attack, defense, { homeAdvantage = 0, applyHomeAdvantage = false } = {}) {
  return Math.exp(attack - defense + (applyHomeAdvantage ? homeAdvantage : 0));
}

export function poissonProbability(goals, lambda) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) {
    factorial *= value;
  }
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function tauAdjustment(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function scorelineProbability(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  return (
    tauAdjustment(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) *
    poissonProbability(homeGoals, lambdaHome) *
    poissonProbability(awayGoals, lambdaAway)
  );
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test packages/tournament-engine/test/dixon-coles.test.js
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tournament-engine/src/engine/dixon-coles.js packages/tournament-engine/test/dixon-coles.test.js
git commit -m "feat: add the Dixon-Coles scoreline probability math as a standalone module"
```

---

### Task 3: Fit Attack/Defense/Home-Advantage/Rho Via Gradient Ascent

**Files:**
- Create: `scripts/lib/fit-dixon-coles.mjs`
- Create: `scripts/lib/fit-dixon-coles.test.mjs`

**Interfaces:**
- Consumes: `computeLambda`/`tauAdjustment` from `packages/tournament-engine/src/engine/dixon-coles.js` (Task 2).
- Produces: `fitDixonColes(matches, teamIds, { iterations, learningRate, l2, xi, referenceDate } = {}) => { attack: Map<string,number>, defense: Map<string,number>, homeAdvantage: number, rho: number }`. `matches` is the array shape `loadCompetitiveMatches` (Task 1) produces; `teamIds` is every team ID that appears in `matches` (not just the 48 World Cup teams — the fit needs the full network of opponents to be well-calibrated).

This task implements the exact analytical gradient of the time-weighted, L2-regularized Dixon-Coles log-likelihood. Per match `(homeTeamId=h, awayTeamId=a, homeGoals=x, awayGoals=y, isNeutralVenue)`, with `λh = computeLambda(attack[h], defense[a], { homeAdvantage, applyHomeAdvantage: !isNeutralVenue })` and `λa = computeLambda(attack[a], defense[h], { applyHomeAdvantage: false })`:

```
gradWrtLambdaHome = (x / λh - 1) + tauGradWrtLambdaHome(x, y, λh, λa, rho)
gradWrtLambdaAway = (y / λa - 1) + tauGradWrtLambdaAway(x, y, λh, λa, rho)

tauGradWrtLambdaHome(x, y, λh, λa, rho):
  (0,0) -> -λa·rho / τ(0,0)
  (0,1) ->  rho    / τ(0,1)
  otherwise -> 0

tauGradWrtLambdaAway(x, y, λh, λa, rho):
  (0,0) -> -λh·rho / τ(0,0)
  (1,0) ->  rho    / τ(1,0)
  otherwise -> 0

tauGradWrtRho(x, y, λh, λa, rho):
  (0,0) -> -λh·λa / τ(0,0)
  (0,1) ->  λh    / τ(0,1)
  (1,0) ->  λa    / τ(1,0)
  (1,1) -> -1     / τ(1,1)
  otherwise -> 0
```

Then, for weight `w = exp(-ξ × daysBetween(match.date, referenceDate))` (days, not years — no `/365`; see the Global Constraints note on why an earlier draft of this formula was wrong):

```
grad[attack[h]]      += w × gradWrtLambdaHome × λh
grad[defense[a]]     += w × gradWrtLambdaHome × (-λh)
grad[attack[a]]      += w × gradWrtLambdaAway × λa
grad[defense[h]]     += w × gradWrtLambdaAway × (-λa)
grad[homeAdvantage]  += w × gradWrtLambdaHome × λh   (only when !isNeutralVenue)
grad[rho]            += w × tauGradWrtRho(x, y, λh, λa, rho)
```

After accumulating over all matches, **divide every accumulated gradient by `totalWeight` (the sum of every match's `w`)** before anything else — this turns the raw sum into a weighted average, which is what keeps the optimizer stable independent of how many matches are in the dataset (the per-match gradient terms above are O(1) in magnitude; summed raw over tens of thousands of matches, the learning rate would need to shrink by a corresponding factor, and `iterations`/`learningRate` chosen for a small dataset would silently diverge to `NaN` on the real one). Then subtract the L2 penalty gradient `2 × l2 × attack[i]` and `2 × l2 × defense[i]` from each team's *averaged* gradient (homeAdvantage and rho are not regularized — they're single global scalars, not a large family of per-team parameters that need an identifiability constraint). Take a gradient-ascent step (`param += learningRate × averagedGrad[param]`) and repeat for `iterations` rounds.

- [ ] **Step 1: Write the failing parameter-recovery test**

Create `scripts/lib/fit-dixon-coles.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { computeLambda, scorelineProbability } from "../../packages/tournament-engine/src/engine/dixon-coles.js";
import { fitDixonColes } from "./fit-dixon-coles.mjs";

function createSeededRandom(seedText) {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    state = Math.imul(state ^ seedText.charCodeAt(index), 16777619);
  }
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleScoreline(lambdaHome, lambdaAway, rho, random) {
  const maxGoals = 8;
  const grid = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x += 1) {
    for (let y = 0; y <= maxGoals; y += 1) {
      const probability = scorelineProbability(x, y, lambdaHome, lambdaAway, rho);
      total += probability;
      grid.push({ x, y, probability });
    }
  }
  let pick = random() * total;
  for (const cell of grid) {
    pick -= cell.probability;
    if (pick <= 0) return cell;
  }
  return grid[grid.length - 1];
}

test("fitDixonColes recovers known attack/defense/homeAdvantage/rho from synthetic data", () => {
  const trueAttack = { A: 0.5, B: 0.2, C: -0.1, D: -0.4 };
  const trueDefense = { A: 0.1, B: -0.1, C: 0.2, D: 0.3 };
  const trueHomeAdvantage = 0.25;
  const trueRho = -0.08;
  const random = createSeededRandom("dixon-coles-recovery-check");

  const teamIds = Object.keys(trueAttack);
  const matches = [];
  let dayOffset = 0;

  for (let round = 0; round < 150; round += 1) {
    for (const home of teamIds) {
      for (const away of teamIds) {
        if (home === away) continue;
        const isNeutralVenue = round % 2 === 0;
        const lambdaHome = computeLambda(trueAttack[home], trueDefense[away], {
          homeAdvantage: trueHomeAdvantage,
          applyHomeAdvantage: !isNeutralVenue
        });
        const lambdaAway = computeLambda(trueAttack[away], trueDefense[home], { applyHomeAdvantage: false });
        const { x, y } = sampleScoreline(lambdaHome, lambdaAway, trueRho, random);
        matches.push({
          date: new Date(2020, 0, 1 + dayOffset),
          homeTeamId: home,
          awayTeamId: away,
          homeGoals: x,
          awayGoals: y,
          isNeutralVenue
        });
        dayOffset += 1;
      }
    }
  }

  const referenceDate = matches[matches.length - 1].date;
  const fit = fitDixonColes(matches, teamIds, {
    iterations: 400,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.001,
    referenceDate
  });

  for (const team of teamIds) {
    assert.ok(
      Math.abs(fit.attack.get(team) - trueAttack[team]) < 0.15,
      `attack[${team}]: expected close to ${trueAttack[team]}, got ${fit.attack.get(team)}`
    );
    assert.ok(
      Math.abs(fit.defense.get(team) - trueDefense[team]) < 0.15,
      `defense[${team}]: expected close to ${trueDefense[team]}, got ${fit.defense.get(team)}`
    );
  }
  assert.ok(Math.abs(fit.homeAdvantage - trueHomeAdvantage) < 0.15);
  assert.ok(Math.abs(fit.rho - trueRho) < 0.15);
});

test("fitDixonColes weights recent matches more than old ones", () => {
  const teamIds = ["A", "B"];
  const referenceDate = new Date(2026, 0, 1);
  const oldMatch = { date: new Date(2000, 0, 1), homeTeamId: "A", awayTeamId: "B", homeGoals: 5, awayGoals: 0, isNeutralVenue: true };
  const recentMatch = { date: new Date(2025, 11, 1), homeTeamId: "A", awayTeamId: "B", homeGoals: 0, awayGoals: 5, isNeutralVenue: true };

  const recentHeavy = fitDixonColes([oldMatch, recentMatch, recentMatch, recentMatch], teamIds, {
    iterations: 200,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.001,
    referenceDate
  });

  assert.ok(
    recentHeavy.attack.get("B") > recentHeavy.attack.get("A"),
    "three heavily-weighted recent B-dominant matches should outweigh one old A-dominant match"
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the fitting procedure**

Create `scripts/lib/fit-dixon-coles.mjs`:

```js
import { computeLambda, tauAdjustment } from "../../packages/tournament-engine/src/engine/dixon-coles.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function tauGradients(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) {
    const tau = tauAdjustment(0, 0, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: (-lambdaAway * rho) / tau, wrtLambdaAway: (-lambdaHome * rho) / tau, wrtRho: (-lambdaHome * lambdaAway) / tau };
  }
  if (homeGoals === 0 && awayGoals === 1) {
    const tau = tauAdjustment(0, 1, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: rho / tau, wrtLambdaAway: 0, wrtRho: lambdaHome / tau };
  }
  if (homeGoals === 1 && awayGoals === 0) {
    const tau = tauAdjustment(1, 0, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: 0, wrtLambdaAway: rho / tau, wrtRho: lambdaAway / tau };
  }
  if (homeGoals === 1 && awayGoals === 1) {
    const tau = tauAdjustment(1, 1, lambdaHome, lambdaAway, rho);
    return { wrtLambdaHome: 0, wrtLambdaAway: 0, wrtRho: -1 / tau };
  }
  return { wrtLambdaHome: 0, wrtLambdaAway: 0, wrtRho: 0 };
}

export function fitDixonColes(matches, teamIds, { iterations = 300, learningRate = 0.3, l2 = 0.001, xi = 0.001, referenceDate } = {}) {
  const attack = new Map(teamIds.map((id) => [id, 0]));
  const defense = new Map(teamIds.map((id) => [id, 0]));
  let homeAdvantage = 0.2;
  let rho = -0.05;

  const weighted = matches.map((match) => ({
    ...match,
    weight: Math.exp((-xi * (referenceDate.getTime() - match.date.getTime())) / MILLISECONDS_PER_DAY)
  }));
  const totalWeight = weighted.reduce((sum, match) => sum + match.weight, 0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const attackGrad = new Map(teamIds.map((id) => [id, 0]));
    const defenseGrad = new Map(teamIds.map((id) => [id, 0]));
    let homeAdvantageGrad = 0;
    let rhoGrad = 0;

    for (const match of weighted) {
      const { homeTeamId: h, awayTeamId: a, homeGoals: x, awayGoals: y, isNeutralVenue, weight } = match;
      const lambdaHome = computeLambda(attack.get(h), defense.get(a), { homeAdvantage, applyHomeAdvantage: !isNeutralVenue });
      const lambdaAway = computeLambda(attack.get(a), defense.get(h), { applyHomeAdvantage: false });
      const tauGrad = tauGradients(x, y, lambdaHome, lambdaAway, rho);

      const gradWrtLambdaHome = (x / lambdaHome - 1) + tauGrad.wrtLambdaHome;
      const gradWrtLambdaAway = (y / lambdaAway - 1) + tauGrad.wrtLambdaAway;

      attackGrad.set(h, attackGrad.get(h) + weight * gradWrtLambdaHome * lambdaHome);
      defenseGrad.set(a, defenseGrad.get(a) + weight * gradWrtLambdaHome * -lambdaHome);
      attackGrad.set(a, attackGrad.get(a) + weight * gradWrtLambdaAway * lambdaAway);
      defenseGrad.set(h, defenseGrad.get(h) + weight * gradWrtLambdaAway * -lambdaAway);
      if (!isNeutralVenue) {
        homeAdvantageGrad += weight * gradWrtLambdaHome * lambdaHome;
      }
      rhoGrad += weight * tauGrad.wrtRho;
    }

    for (const id of teamIds) {
      const meanAttackGrad = attackGrad.get(id) / totalWeight;
      const meanDefenseGrad = defenseGrad.get(id) / totalWeight;
      attack.set(id, attack.get(id) + learningRate * (meanAttackGrad - 2 * l2 * attack.get(id)));
      defense.set(id, defense.get(id) + learningRate * (meanDefenseGrad - 2 * l2 * defense.get(id)));
    }
    homeAdvantage += learningRate * (homeAdvantageGrad / totalWeight);
    rho += learningRate * (rhoGrad / totalWeight);
  }

  return { attack, defense, homeAdvantage, rho };
}
```

**Why this differs from a naive implementation of the gradient formulas above:** the per-match gradient terms are summed first (`attackGrad`, `defenseGrad`, `homeAdvantageGrad`, `rhoGrad`), then divided by `totalWeight` before the learning-rate step — averaging, not summing. A raw, unnormalized sum over a large dataset (the real historical dataset Task 4 trains on has 31,017 matches) produces a gradient whose magnitude scales with dataset size, so any fixed learning rate that's stable for a small dataset diverges to `NaN` on a large one. Dividing by `totalWeight` keeps the step size meaningful regardless of how many matches are in `matches`.

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: both tests pass. If the recovery test is flaky (parameters land just outside the 0.15 tolerance), increase `iterations` first — this is a plain gradient-ascent loop, not a flaky-by-nature randomized algorithm, so a real failure means a real bug in the gradient derivation, not noise to retry away.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fit-dixon-coles.mjs scripts/lib/fit-dixon-coles.test.mjs
git commit -m "feat: implement Dixon-Coles parameter fitting via gradient ascent"
```

---

### Task 4: Training Script — Run It For Real And Commit The Output

**Files:**
- Create: `scripts/train-prediction-model.mjs`
- Create: `packages/tournament-engine/src/data/team-strength.js` (generated by running the script — not hand-written)

**Interfaces:**
- Consumes: `loadCompetitiveMatches`/`TEAM_NAME_TO_ID` (Task 1), `fitDixonColes` (Task 3).
- Produces: `packages/tournament-engine/src/data/team-strength.js` exporting `teamStrength` (`Record<teamId, { attack: number, defense: number }>` for the 48 World Cup 2026 teams) and `modelConstants` (`{ homeAdvantage: number, rho: number, trainedAt: string, dataSource: string, matchCount: number }`).

- [ ] **Step 1: Write the script**

Create `scripts/train-prediction-model.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";

import { loadCompetitiveMatches, TEAM_NAME_TO_ID } from "./lib/historical-results.mjs";
import { fitDixonColes } from "./lib/fit-dixon-coles.mjs";

const WORLD_CUP_2026_TEAM_IDS = [...new Set(TEAM_NAME_TO_ID.values())];

function main() {
  const csvText = readFileSync("scripts/data/international-results.csv", "utf8");
  const matches = loadCompetitiveMatches(csvText);
  console.log(`Loaded ${matches.length} competitive historical matches.`);

  const teamIds = [...new Set(matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]))];
  const referenceDate = matches.reduce((latest, match) => (match.date > latest ? match.date : latest), matches[0].date);

  const matchCountByTeam = new Map();
  for (const match of matches) {
    matchCountByTeam.set(match.homeTeamId, (matchCountByTeam.get(match.homeTeamId) ?? 0) + 1);
    matchCountByTeam.set(match.awayTeamId, (matchCountByTeam.get(match.awayTeamId) ?? 0) + 1);
  }
  const underSampled = WORLD_CUP_2026_TEAM_IDS.filter((id) => (matchCountByTeam.get(id) ?? 0) < 10);
  if (underSampled.length > 0) {
    throw new Error(`These 2026 World Cup teams have fewer than 10 historical competitive matches: ${underSampled.join(", ")}. Check TEAM_NAME_TO_ID for a missing historical name alias before trusting this fit.`);
  }

  console.log("Fitting Dixon-Coles parameters (this takes a few minutes)...");
  const fit = fitDixonColes(matches, teamIds, {
    iterations: 20000,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate
  });
  if ([...fit.attack.values(), fit.homeAdvantage, fit.rho].some((value) => !Number.isFinite(value))) {
    throw new Error("Fit diverged to NaN/Infinity on the real dataset. Halve learningRate and retry before assuming a deeper bug.");
  }

  const teamStrength = {};
  for (const id of WORLD_CUP_2026_TEAM_IDS) {
    teamStrength[id] = { attack: Number(fit.attack.get(id).toFixed(4)), defense: Number(fit.defense.get(id).toFixed(4)) };
  }

  const output = `// Generated by scripts/train-prediction-model.mjs -- do not hand-edit.
export const teamStrength = ${JSON.stringify(teamStrength, null, 2)};

export const modelConstants = {
  homeAdvantage: ${fit.homeAdvantage.toFixed(4)},
  rho: ${fit.rho.toFixed(4)},
  trainedAt: "${new Date().toISOString()}",
  dataSource: "martj42/international_results",
  matchCount: ${matches.length}
};
`;

  writeFileSync("packages/tournament-engine/src/data/team-strength.js", output);
  console.log("Wrote packages/tournament-engine/src/data/team-strength.js");
  console.log(`homeAdvantage=${fit.homeAdvantage.toFixed(4)} rho=${fit.rho.toFixed(4)}`);
}

main();
```

- [ ] **Step 2: Run it for real**

```bash
node scripts/train-prediction-model.mjs
```
Expected: prints the loaded match count, confirms no under-sampled teams, prints `homeAdvantage`/`rho`, and writes `packages/tournament-engine/src/data/team-strength.js`. This will take a few minutes (400 iterations × tens of thousands of matches × ~50 teams). If it throws the under-sampled-teams error, stop — that means Task 1's `TEAM_NAME_TO_ID` is missing a historical alias for that team; investigate and fix Task 1 before re-running.

- [ ] **Step 3: Sanity-check the real output**

```bash
node --input-type=module -e "
import { teamStrength, modelConstants } from './packages/tournament-engine/src/data/team-strength.js';
console.log('teams:', Object.keys(teamStrength).length);
console.log('Argentina attack/defense:', teamStrength.ARG);
console.log('constants:', modelConstants);
const sorted = Object.entries(teamStrength).sort((a, b) => b[1].attack - a[1].attack).slice(0, 5);
console.log('top 5 attack:', sorted);
"
```
Expected: exactly 48 teams; `homeAdvantage` is a small positive number (real home advantage in football is real but modest, typically in the 0.1-0.4 range on this log scale); the top-attack teams are plausible (well-known attacking sides — sanity-check this list looks reasonable, not a sign the fit diverged).

- [ ] **Step 4: Commit**

```bash
git add scripts/train-prediction-model.mjs packages/tournament-engine/src/data/team-strength.js
git commit -m "feat: train and commit the fitted Dixon-Coles team-strength parameters"
```

---

### Task 5: Wire `predictor.js` Onto The Trained Model

**Files:**
- Modify: `packages/tournament-engine/src/engine/predictor.js`
- Modify: `packages/tournament-engine/test/predictor.test.js` (or wherever the existing predictor tests live — locate via `grep -rl "predictMatch\|expectedGoals\|winProbability" packages/tournament-engine/test/`)
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`

**Interfaces:**
- Consumes: `teamStrength`/`modelConstants` from `../data/team-strength.js`; `computeLambda`/`scorelineProbability` from `./dixon-coles.js`.
- Produces: `isHostNationFixture(teamId)` (new export) — `true` for `"MEX"`, `"CAN"`, `"USA"`. `expectedGoals(attackingTeam, defendingTeam, { applyHomeAdvantage = false } = {})` (signature changed — third argument is new, and home advantage is now explicit rather than inferred from argument order). `winProbability`/`predictMatch`/`simulateScore`/`simulateGroupMatch` keep their existing call signatures from the rest of the codebase's perspective, except `predictMatch`/`simulateScore` gain an optional `isNeutralVenue` field in their options object (defaulting to `true`).

**Critical correctness note carried over from planning:** home advantage must never apply to the away team's expected goals, regardless of which positional argument a caller passes first. The current code calls `expectedGoals(teamA, teamB)` symmetrically (once as `(home, away)`, once as `(away, home)`) — that pattern breaks once a real home-advantage term exists, because the second call would otherwise need to know it's computing the *away* team's goals and must not apply the boost. The new `applyHomeAdvantage` flag is supplied explicitly by the caller at each call site rather than inferred, so this can't silently regress.

- [ ] **Step 1: Locate and read the existing predictor tests**

```bash
grep -rl "expectedGoals\|winProbability\|predictMatch" packages/tournament-engine/test/
```
Read whatever file(s) this finds in full before proceeding — the exact existing test structure (e.g. test team fixtures with `.rating`) needs to be replaced with team fixtures shaped for `team-strength.js` lookups, not edited blindly without seeing it.

- [ ] **Step 2: Update the predictor tests for the new model**

In that test file, replace every test team fixture that used `{ id: "...", rating: ... }` with `{ id: "...", attack: ..., defense: ... }`-style local stub data, **and** stub `team-strength.js`'s lookup. Since `predictor.js` will import `teamStrength` directly from the generated data file (Step 3 below), and the real file holds 48 real teams' real fitted numbers (not convenient round test numbers), write the new tests against two synthetic team IDs the real `team-strength.js` will never contain (e.g. `"TEST_HOME"`/`"TEST_AWAY"`), and have `predictor.js` accept an optional injected `teamStrength` lookup for testability — add a single new exported function for this:

```js
export function expectedGoals(attackingTeam, defendingTeam, { applyHomeAdvantage = false, strength = teamStrength, advantage = modelConstants.homeAdvantage } = {}) {
  const attack = strength[attackingTeam.id]?.attack;
  const defense = strength[defendingTeam.id]?.defense;
  if (!Number.isFinite(attack) || !Number.isFinite(defense)) {
    throw new TypeError(`expectedGoals requires fitted team-strength data for "${attackingTeam.id}" and "${defendingTeam.id}"`);
  }
  return computeLambda(attack, defense, { homeAdvantage: advantage, applyHomeAdvantage });
}
```

Write these tests (adapt the exact assertions to whatever the existing file's style/exports require, but cover all of):

```js
test("expectedGoals applies home advantage only when explicitly requested, using injected team strength", () => {
  const strength = { TEST_HOME: { attack: 0.4, defense: 0.1 }, TEST_AWAY: { attack: 0.2, defense: 0.3 } };
  const home = { id: "TEST_HOME" };
  const away = { id: "TEST_AWAY" };

  const withoutAdvantage = expectedGoals(home, away, { strength, advantage: 0.3, applyHomeAdvantage: false });
  const withAdvantage = expectedGoals(home, away, { strength, advantage: 0.3, applyHomeAdvantage: true });

  assert.equal(withoutAdvantage, Math.exp(0.4 - 0.3));
  assert.equal(withAdvantage, Math.exp(0.4 - 0.3 + 0.3));
});

test("expectedGoals throws for a team missing from the strength table instead of returning NaN", () => {
  const strength = { TEST_HOME: { attack: 0.4, defense: 0.1 } };
  assert.throws(() => expectedGoals({ id: "TEST_HOME" }, { id: "UNKNOWN" }, { strength }), TypeError);
});

test("isHostNationFixture is true only for Mexico, Canada, and the United States", () => {
  assert.equal(isHostNationFixture("MEX"), true);
  assert.equal(isHostNationFixture("CAN"), true);
  assert.equal(isHostNationFixture("USA"), true);
  assert.equal(isHostNationFixture("BRA"), false);
});

test("winProbability is derived from the same scoreline grid predictMatch builds, not a separate formula", () => {
  const strength = { TEST_HOME: { attack: 0.4, defense: 0.1 }, TEST_AWAY: { attack: 0.1, defense: 0.2 } };
  const home = { id: "TEST_HOME" };
  const away = { id: "TEST_AWAY" };

  const prediction = predictMatch(home, away, { strength, advantage: 0.2, rho: -0.05, isNeutralVenue: true, scorelineCount: 200 });
  const probability = winProbability(home, away, { strength, advantage: 0.2, rho: -0.05, isNeutralVenue: true });

  assert.ok(Math.abs(probability - (prediction.probabilities.homeWin + 0.5 * prediction.probabilities.draw)) < 1e-9);
});
```

- [ ] **Step 3: Run the tests and verify RED**

```bash
node --test packages/tournament-engine/test/<the file from Step 1>
```
Expected: FAIL — current `predictor.js` still uses `.rating` and has no `isHostNationFixture`/injectable `strength`.

- [ ] **Step 4: Rewrite `predictor.js`**

Replace the full contents of `packages/tournament-engine/src/engine/predictor.js`:

```js
import { computeLambda, scorelineProbability } from "./dixon-coles.js";
import { modelConstants, teamStrength } from "../data/team-strength.js";

const PREDICTION_MODEL = Object.freeze({
  id: "dixon-coles-v1",
  label: "Dixon-Coles (fitted on martj42/international_results)",
  trained: true,
  trainedAt: modelConstants.trainedAt,
  dataSource: modelConstants.dataSource
});

const HOST_NATION_IDS = new Set(["MEX", "CAN", "USA"]);

export function isHostNationFixture(teamId) {
  return HOST_NATION_IDS.has(teamId);
}

export function expectedGoals(
  attackingTeam,
  defendingTeam,
  { applyHomeAdvantage = false, strength = teamStrength, advantage = modelConstants.homeAdvantage } = {}
) {
  const attack = strength[attackingTeam.id]?.attack;
  const defense = strength[defendingTeam.id]?.defense;
  if (!Number.isFinite(attack) || !Number.isFinite(defense)) {
    throw new TypeError(`expectedGoals requires fitted team-strength data for "${attackingTeam.id}" and "${defendingTeam.id}"`);
  }
  return computeLambda(attack, defense, { homeAdvantage: advantage, applyHomeAdvantage });
}

export function samplePoisson(lambda, random = Math.random) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count += 1;
    product *= random();
  } while (product > limit);

  return count - 1;
}

export function simulateScore(homeTeam, awayTeam, random = Math.random, { isNeutralVenue = true, strength = teamStrength, advantage = modelConstants.homeAdvantage } = {}) {
  return {
    homeGoals: samplePoisson(expectedGoals(homeTeam, awayTeam, { applyHomeAdvantage: !isNeutralVenue, strength, advantage }), random),
    awayGoals: samplePoisson(expectedGoals(awayTeam, homeTeam, { applyHomeAdvantage: false, strength, advantage }), random)
  };
}

function buildScorelineGrid(homeTeam, awayTeam, { maxGoals = 10, isNeutralVenue = true, strength = teamStrength, advantage = modelConstants.homeAdvantage, rho = modelConstants.rho } = {}) {
  const homeLambda = expectedGoals(homeTeam, awayTeam, { applyHomeAdvantage: !isNeutralVenue, strength, advantage });
  const awayLambda = expectedGoals(awayTeam, homeTeam, { applyHomeAdvantage: false, strength, advantage });
  const rawScorelines = [];
  let capturedMass = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = scorelineProbability(homeGoals, awayGoals, homeLambda, awayLambda, rho);
      capturedMass += probability;
      rawScorelines.push({ homeGoals, awayGoals, probability });
    }
  }

  const normalized = rawScorelines
    .map((scoreline) => ({ ...scoreline, probability: scoreline.probability / capturedMass }))
    .sort(
      (left, right) =>
        right.probability - left.probability || left.homeGoals - right.homeGoals || left.awayGoals - right.awayGoals
    );

  const probabilities = normalized.reduce(
    (result, scoreline) => {
      if (scoreline.homeGoals > scoreline.awayGoals) result.homeWin += scoreline.probability;
      else if (scoreline.homeGoals < scoreline.awayGoals) result.awayWin += scoreline.probability;
      else result.draw += scoreline.probability;
      return result;
    },
    { homeWin: 0, draw: 0, awayWin: 0 }
  );

  return { scorelines: normalized, probabilities };
}

export function predictMatch(homeTeam, awayTeam, options = {}) {
  const { maxGoals = 10, scorelineCount = 3, isNeutralVenue = true, strength = teamStrength, advantage = modelConstants.homeAdvantage, rho = modelConstants.rho } = options;
  const { scorelines: normalized, probabilities } = buildScorelineGrid(homeTeam, awayTeam, { maxGoals, isNeutralVenue, strength, advantage, rho });
  const scorelines = normalized.slice(0, scorelineCount);

  return {
    model: PREDICTION_MODEL,
    probabilities,
    mostLikelyScore: scorelines[0],
    scorelines
  };
}

export function winProbability(teamA, teamB, options = {}) {
  const { isNeutralVenue = true, strength = teamStrength, advantage = modelConstants.homeAdvantage, rho = modelConstants.rho } = options;
  const { probabilities } = buildScorelineGrid(teamA, teamB, { isNeutralVenue, strength, advantage, rho });
  return probabilities.homeWin + 0.5 * probabilities.draw;
}

export function simulateGroupMatch(match, teamsById, random = Math.random) {
  if (Number.isFinite(match.homeGoals) && Number.isFinite(match.awayGoals)) {
    return { ...match };
  }

  const isNeutralVenue = !isHostNationFixture(match.homeTeamId);
  const score = simulateScore(teamsById[match.homeTeamId], teamsById[match.awayTeamId], random, { isNeutralVenue });
  return { ...match, ...score };
}

export function pickKnockoutWinner(teamA, teamB, random = Math.random) {
  const probability = winProbability(teamA, teamB);
  return random() <= probability ? teamA.id : teamB.id;
}
```

Note `predictMatch`'s old required-rating `TypeError` check is gone — `expectedGoals` now throws that check itself (for both teams, automatically, since `buildScorelineGrid` calls it for both home and away lambdas), so the old explicit `if (!Number.isFinite(homeTeam?.rating) ...)` guard at the top of `predictMatch` is redundant and removed rather than translated.

- [ ] **Step 5: Run the predictor tests and verify GREEN**

```bash
node --test packages/tournament-engine/test/<the file from Step 1>
```
Expected: all tests (existing + new) pass.

- [ ] **Step 6: Thread `isNeutralVenue` through the Fixtures-tab prediction**

In `apps/web/components/match-centre/match-centre-app.tsx`, find (around line 725):

```ts
  const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
  const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
  const prediction =
    shouldShowPreMatchPrediction(match.status) &&
    Number.isFinite(homeTeam?.rating) &&
    Number.isFinite(awayTeam?.rating)
      ? predictMatch(homeTeam, awayTeam)
      : undefined;
```

Replace with:

```ts
  const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
  const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
  const prediction =
    shouldShowPreMatchPrediction(match.status) && homeTeam && awayTeam
      ? predictMatch(homeTeam, awayTeam, { isNeutralVenue: !isHostNationFixture(match.homeTeamId ?? "") })
      : undefined;
```

The `Number.isFinite(homeTeam?.rating)` checks are gone because correctness is no longer about `rating` at all (`predictMatch` now throws its own clear error if team-strength data is missing for either team, which it never will be for any of the 48 real teams this app uses — the `homeTeam && awayTeam` check alone is sufficient to guard against an unresolved slot).

Add `isHostNationFixture` to the existing `@wc/tournament-engine` import list at the top of the file (alongside `buildGroupTable`, `predictMatch`, etc.).

- [ ] **Step 7: Run the full repo test suite, typecheck, and build**

```bash
npm test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```
Expected: all pass. (`apps/web`'s own tests don't assert specific prediction numbers, only shapes, so they should be unaffected by the model swap — if any do assert exact numbers tied to the old rating-based formula, update them to match the new model's actual output rather than forcing the old numbers.)

- [ ] **Step 8: Commit**

```bash
git add packages/tournament-engine/src/engine/predictor.js packages/tournament-engine/test apps/web/components/match-centre/match-centre-app.tsx
git commit -m "feat: wire predictor.js onto the trained Dixon-Coles model"
```

---

### Task 6: Offline Backtest And Methodology Report

**Files:**
- Create: `scripts/evaluate-prediction-model.mjs`
- Create: `scripts/lib/evaluation-metrics.mjs`
- Create: `scripts/lib/evaluation-metrics.test.mjs`
- Create: `docs/model-evaluation-report.md` (generated by running the script)

**Interfaces:**
- Consumes: `loadCompetitiveMatches` (Task 1), `fitDixonColes` (Task 3), `computeLambda`/`scorelineProbability` (Task 2).
- Produces: `logLoss(predictions)`, `brierScore(predictions)`, `accuracy(predictions)` where `predictions` is `Array<{ probabilities: { homeWin, draw, awayWin }, actual: "homeWin" | "draw" | "awayWin" }>`.

This evaluation deliberately re-fits a *separate* model on a train-only slice rather than reusing the production `team-strength.js` (which is trained on the full dataset) — reusing it would let the backtest's "future" matches leak into its own training data, invalidating the result.

- [ ] **Step 1: Write the failing metric tests**

Create `scripts/lib/evaluation-metrics.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { accuracy, brierScore, logLoss } from "./evaluation-metrics.mjs";

const predictions = [
  { probabilities: { homeWin: 0.7, draw: 0.2, awayWin: 0.1 }, actual: "homeWin" },
  { probabilities: { homeWin: 0.3, draw: 0.3, awayWin: 0.4 }, actual: "awayWin" },
  { probabilities: { homeWin: 0.5, draw: 0.3, awayWin: 0.2 }, actual: "draw" }
];

test("accuracy counts predictions whose highest-probability outcome matches the actual outcome", () => {
  assert.ok(Math.abs(accuracy(predictions) - 2 / 3) < 1e-9);
});

test("logLoss matches the hand-computed multi-class log loss", () => {
  const expected = -(Math.log(0.7) + Math.log(0.4) + Math.log(0.3)) / 3;
  assert.ok(Math.abs(logLoss(predictions) - expected) < 1e-9);
});

test("brierScore matches the hand-computed multi-class Brier score", () => {
  const expected =
    ((1 - 0.7) ** 2 + 0.2 ** 2 + 0.1 ** 2 +
      0.3 ** 2 + 0.3 ** 2 + (1 - 0.4) ** 2 +
      0.5 ** 2 + (1 - 0.3) ** 2 + 0.2 ** 2) /
    3;
  assert.ok(Math.abs(brierScore(predictions) - expected) < 1e-9);
});

test("a perfect-confidence, always-correct predictor scores 0 on both log loss and Brier score", () => {
  const perfect = [{ probabilities: { homeWin: 1, draw: 0, awayWin: 0 }, actual: "homeWin" }];
  assert.ok(Math.abs(logLoss(perfect)) < 1e-9);
  assert.ok(Math.abs(brierScore(perfect)) < 1e-9);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/evaluation-metrics.test.mjs
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the metrics**

Create `scripts/lib/evaluation-metrics.mjs`:

```js
const OUTCOMES = ["homeWin", "draw", "awayWin"];

export function accuracy(predictions) {
  const correct = predictions.filter((prediction) => {
    const best = OUTCOMES.reduce((a, b) => (prediction.probabilities[a] >= prediction.probabilities[b] ? a : b));
    return best === prediction.actual;
  }).length;
  return correct / predictions.length;
}

export function logLoss(predictions) {
  const total = predictions.reduce((sum, prediction) => {
    const probability = Math.max(prediction.probabilities[prediction.actual], 1e-15);
    return sum - Math.log(probability);
  }, 0);
  return total / predictions.length;
}

export function brierScore(predictions) {
  const total = predictions.reduce((sum, prediction) => {
    const squaredErrors = OUTCOMES.reduce((errorSum, outcome) => {
      const actualIndicator = outcome === prediction.actual ? 1 : 0;
      return errorSum + (prediction.probabilities[outcome] - actualIndicator) ** 2;
    }, 0);
    return sum + squaredErrors;
  }, 0);
  return total / predictions.length;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/evaluation-metrics.test.mjs
```
Expected: all 4 tests pass.

- [ ] **Step 5: Write and run the backtest script**

Create `scripts/evaluate-prediction-model.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";

import { computeLambda, scorelineProbability } from "../packages/tournament-engine/src/engine/dixon-coles.js";
import { accuracy, brierScore, logLoss } from "./lib/evaluation-metrics.mjs";
import { fitDixonColes } from "./lib/fit-dixon-coles.mjs";
import { loadCompetitiveMatches } from "./lib/historical-results.mjs";

const HOLDOUT_CUTOFF = new Date("2021-01-01");

function outcomeOf(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "homeWin";
  if (homeGoals < awayGoals) return "awayWin";
  return "draw";
}

function predictOutcomeProbabilities(homeTeamId, awayTeamId, fit, isNeutralVenue) {
  const lambdaHome = computeLambda(fit.attack.get(homeTeamId), fit.defense.get(awayTeamId), {
    homeAdvantage: fit.homeAdvantage,
    applyHomeAdvantage: !isNeutralVenue
  });
  const lambdaAway = computeLambda(fit.attack.get(awayTeamId), fit.defense.get(homeTeamId), { applyHomeAdvantage: false });

  const probabilities = { homeWin: 0, draw: 0, awayWin: 0 };
  for (let homeGoals = 0; homeGoals <= 10; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 10; awayGoals += 1) {
      const probability = scorelineProbability(homeGoals, awayGoals, lambdaHome, lambdaAway, fit.rho);
      probabilities[outcomeOf(homeGoals, awayGoals)] += probability;
    }
  }
  const total = probabilities.homeWin + probabilities.draw + probabilities.awayWin;
  return { homeWin: probabilities.homeWin / total, draw: probabilities.draw / total, awayWin: probabilities.awayWin / total };
}

function main() {
  const csvText = readFileSync("scripts/data/international-results.csv", "utf8");
  const allMatches = loadCompetitiveMatches(csvText);
  const trainMatches = allMatches.filter((match) => match.date < HOLDOUT_CUTOFF);
  const testMatches = allMatches.filter((match) => match.date >= HOLDOUT_CUTOFF);

  console.log(`Train: ${trainMatches.length} matches before ${HOLDOUT_CUTOFF.toISOString().slice(0, 10)}`);
  console.log(`Test: ${testMatches.length} matches on/after that date`);

  const trainTeamIds = new Set(trainMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
  const fit = fitDixonColes(trainMatches, [...trainTeamIds], {
    iterations: 20000,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate: HOLDOUT_CUTOFF
  });

  const evaluable = testMatches.filter((match) => trainTeamIds.has(match.homeTeamId) && trainTeamIds.has(match.awayTeamId));
  console.log(`Evaluable test matches (both teams seen in training): ${evaluable.length}`);

  const predictions = evaluable.map((match) => ({
    probabilities: predictOutcomeProbabilities(match.homeTeamId, match.awayTeamId, fit, match.isNeutralVenue),
    actual: outcomeOf(match.homeGoals, match.awayGoals)
  }));

  const results = {
    accuracy: accuracy(predictions),
    logLoss: logLoss(predictions),
    brierScore: brierScore(predictions),
    evaluatedMatchCount: predictions.length,
    holdoutCutoff: HOLDOUT_CUTOFF.toISOString().slice(0, 10)
  };

  console.log(results);

  const report = `# Prediction Model Evaluation Report

Generated by \`scripts/evaluate-prediction-model.mjs\`.

## Methodology

A Dixon-Coles model is fit on every competitive (non-friendly) historical match before **${results.holdoutCutoff}**, then evaluated against the **${results.evaluatedMatchCount}** competitive matches on or after that date where both teams had appeared in the training data. This model is fit independently from the production \`packages/tournament-engine/src/data/team-strength.js\` (which trains on the full dataset) specifically so the held-out matches never leak into training.

## Results

| Metric | Value | Interpretation |
| --- | --- | --- |
| Accuracy | ${(results.accuracy * 100).toFixed(1)}% | Fraction of matches where the model's highest-probability outcome (home win / draw / away win) matched the real result. |
| Log loss | ${results.logLoss.toFixed(4)} | Lower is better; 0 is a perfect, fully-confident-and-correct model. A model that always predicted 1/3-1/3-1/3 would score \`-ln(1/3) ≈ 1.0986\`, a useful naive baseline for comparison. |
| Brier score | ${results.brierScore.toFixed(4)} | Lower is better; 0 is perfect. A 1/3-1/3-1/3 naive baseline scores \`2/3 ≈ 0.667\`. |

## Data

- Source: martj42/international_results (CC0), see \`scripts/data/SOURCE.md\`.
- Competitive matches only (friendlies excluded); the 2026 World Cup itself is excluded from both training and evaluation here (it's the held-out tournament the production model exists to predict, not something to backtest against).
`;

  writeFileSync("docs/model-evaluation-report.md", report);
  console.log("Wrote docs/model-evaluation-report.md");
}

main();
```

```bash
node scripts/evaluate-prediction-model.mjs
```
Expected: prints train/test counts and the three metrics, writes `docs/model-evaluation-report.md`. Read the printed accuracy/log-loss/Brier numbers — accuracy should land somewhere in a plausible range for football outcome prediction (most published models land roughly in the 45-55% three-way accuracy range; football has a lot of irreducible randomness, so anything wildly above that on this dataset would be more likely to indicate a bug — e.g., a leak — than a breakthrough). Log loss should beat the 1.0986 naive baseline and Brier score should beat the 0.667 naive baseline; if either doesn't, stop and investigate before treating Task 4's trained model as trustworthy.

- [ ] **Step 6: Commit**

```bash
git add scripts/evaluate-prediction-model.mjs scripts/lib/evaluation-metrics.mjs scripts/lib/evaluation-metrics.test.mjs docs/model-evaluation-report.md
git commit -m "feat: add the offline backtest script and commit its evaluation report"
```

---

### Task 7: Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete verification suite**

```bash
npm test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
```
Expected: all exit `0`.

- [ ] **Step 2: Browser-verify all four prediction surfaces still render sensibly**

```bash
npm run dev --workspace apps/web
```

Using the `/browse` skill or a regular browser, check:
- **Fixtures tab**: an upcoming match's "Likely X-Y" prediction renders a real scoreline (not blank/NaN), and the percentages sum to ~100%.
- **Standings tab → Projected Group Tables**: still renders all 12 groups with sensible PTS/GD (this shouldn't change at all — it depends on `runMonteCarlo`'s aggregation logic, not the model swap directly, but it does depend on `simulateGroupMatch` succeeding without throwing for every real team, which is the actual risk here).
- **Bracket tab → Projected Bracket**: still renders, no thrown errors (depends on `pickKnockoutWinner`/`winProbability` succeeding for every real team).
- **Forecast tab → Stakes panel**: still renders illustrative scenario scorelines for a visible match.

No console errors on any of the four tabs.

- [ ] **Step 3: Spot-check that the new model's predictions look qualitatively reasonable**

```bash
node --input-type=module -e "
import { teams } from './packages/tournament-engine/src/data/index.js';
import { predictMatch } from './packages/tournament-engine/src/engine/predictor.js';

const arg = teams.find((t) => t.id === 'ARG');
const jor = teams.find((t) => t.id === 'JOR');
const prediction = predictMatch(arg, jor, { isNeutralVenue: true });
console.log('Argentina vs Jordan:', JSON.stringify(prediction.probabilities), prediction.mostLikelyScore);
"
```
Expected: Argentina (a far stronger team by any reasonable measure) should be assigned a clearly higher win probability than Jordan. If the favorite/underdog assignment looks backwards for several such spot-checks, stop — that's a sign of a sign error somewhere in the attack/defense convention (most likely: defense's sign got flipped somewhere, since a *higher* `defense` value is supposed to mean *more* goals conceded, i.e. worse defense) rather than something to paper over.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/trained-prediction-model
gh pr create --base main --head feat/trained-prediction-model --title "feat: replace the baseline prediction model with a trained Dixon-Coles model" --body "See docs/superpowers/specs/2026-06-24-trained-prediction-model-design.md and docs/model-evaluation-report.md for the full design and backtest results."
```

- [ ] **Step 5: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.
