# FIFA-Rank-Informed Prior And In-Tournament Retraining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trained Dixon-Coles model's zero-centered regularization with an empirical-Bayes prior derived from each World Cup team's real FIFA ranking, and let training optionally incorporate the current World Cup's already-played results.

**Architecture:** `fitDixonColes` gains optional per-team prior/regularization-strength parameters, defaulting to today's exact behavior. A new orchestration function runs it twice — once to get a baseline fit, once regularized toward a FIFA-rank-derived prior computed from that baseline — and both the training and evaluation scripts switch to calling it. Separately, `loadCompetitiveMatches` gains a flag controlling whether the in-progress 2026 World Cup's already-played matches are visible to training.

**Tech Stack:** Node.js ESM, Node built-in test runner.

## Global Constraints

- `fitDixonColes`'s new options (`attackPrior`, `defensePrior`, `l2ByTeam`) must default to exactly today's behavior (zero prior, flat `l2`) — every existing caller and test must keep working unmodified.
- The FIFA-rank regression uses only the 48 World Cup teams (the only ones with a real `fifaRanking`) with effective match count ≥ 30; every other team in the network keeps a zero prior.
- Regression target is `ln(fifaRanking)`, not raw rank.
- `l2ByTeam[id] = baseL2 × (100 / max(effectiveMatchCount[id], 1))`, applied to every team regardless of whether they have a FIFA-rank-based prior or the default zero one.
- `homeAdvantage`/`rho` are never regularized (unchanged from the existing code).
- `evaluate-prediction-model.mjs` always trains with `excludeUpcomingWorldCup: true` — the in-tournament-retraining flag only ever applies to the production training script, never the backtest.
- Fewer than 5 reliable World Cup teams must throw a clear error rather than silently fitting a regression on too little data.

---

## File Structure

- Modify `scripts/lib/fit-dixon-coles.mjs` — `fitDixonColes` gains `attackPrior`/`defensePrior`/`l2ByTeam` options. New exports: `computeEffectiveMatchCounts`, `linearRegression`, `fitDixonColesWithFifaRankPrior`.
- Modify `scripts/lib/historical-results.mjs` — `loadCompetitiveMatches` gains an `excludeUpcomingWorldCup` option (default `true`).
- Modify `scripts/train-prediction-model.mjs` — parses `--include-current-tournament`, reads `fifaRanking` per team from `teams.js`, calls `fitDixonColesWithFifaRankPrior`.
- Modify `scripts/evaluate-prediction-model.mjs` — calls `fitDixonColesWithFifaRankPrior` instead of `fitDixonColes`, always with `excludeUpcomingWorldCup: true`.

---

### Task 1: Effective Match Counts And A Small Linear Regression Helper

**Files:**
- Modify: `scripts/lib/fit-dixon-coles.mjs`
- Modify: `scripts/lib/fit-dixon-coles.test.mjs`

**Interfaces:**
- Produces: `computeEffectiveMatchCounts(matches, teamIds, { xi, referenceDate }) => Map<teamId, number>` — for each team, the sum of `exp(-xi × daysBetween(match.date, referenceDate))` across every match they appear in (home or away).
- Produces: `linearRegression(points) => { slope, intercept }` where `points` is `Array<{ x: number, y: number }>`, fit via ordinary least squares.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/fit-dixon-coles.test.mjs` (append; keep all existing tests and imports):

```js
import { computeEffectiveMatchCounts, linearRegression } from "./fit-dixon-coles.mjs";

test("computeEffectiveMatchCounts weights recent matches more than old ones, summed per team", () => {
  const referenceDate = new Date(2026, 0, 1);
  const matches = [
    { date: new Date(2025, 11, 1), homeTeamId: "A", awayTeamId: "B" }, // 31 days before referenceDate
    { date: new Date(2000, 0, 1), homeTeamId: "A", awayTeamId: "C" }, // ~26 years before referenceDate -- negligible weight
    { date: new Date(2025, 10, 1), homeTeamId: "B", awayTeamId: "C" } // 61 days before referenceDate
  ];

  const counts = computeEffectiveMatchCounts(matches, ["A", "B", "C"], { xi: 0.01, referenceDate });

  // A: one 31-day-old match + one ~26-year-old match (weight ~0).
  // B: one 31-day-old match + one 61-day-old match -- strictly more total weight than A.
  // C: one ~26-year-old match (weight ~0) + one 61-day-old match.
  assert.ok(counts.get("A") > 0 && counts.get("B") > 0 && counts.get("C") > 0);
  assert.ok(
    counts.get("B") > counts.get("A"),
    "B has two recent matches; A has only one recent match plus one negligibly-weighted ancient one, so B's total must be strictly higher"
  );

  const ancientMatchWeight = Math.exp((-0.01 * (referenceDate.getTime() - new Date(2000, 0, 1).getTime())) / (24 * 60 * 60 * 1000));
  assert.ok(ancientMatchWeight < 1e-9, "sanity check: the year-2000 match's weight must itself be negligible for the assertion below to hold");

  const expectedC = Math.exp(-0.01 * 61);
  assert.ok(Math.abs(counts.get("C") - expectedC) < 1e-9);
});

test("linearRegression recovers a known slope and intercept from points exactly on a line", () => {
  const points = [
    { x: 0, y: 5 },
    { x: 1, y: 8 },
    { x: 2, y: 11 },
    { x: 3, y: 14 }
  ];

  const { slope, intercept } = linearRegression(points);

  assert.ok(Math.abs(slope - 3) < 1e-9);
  assert.ok(Math.abs(intercept - 5) < 1e-9);
});

test("linearRegression fits a least-squares line through noisy points", () => {
  const points = [
    { x: 1, y: 2.1 },
    { x: 2, y: 3.9 },
    { x: 3, y: 6.2 },
    { x: 4, y: 7.8 }
  ];

  const { slope, intercept } = linearRegression(points);

  // Hand-computed OLS for these 4 points: slope = 1.94, intercept = 0.15.
  assert.ok(Math.abs(slope - 1.94) < 1e-9);
  assert.ok(Math.abs(intercept - 0.15) < 1e-9);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: FAIL — `computeEffectiveMatchCounts`/`linearRegression` aren't exported yet.

- [ ] **Step 3: Implement both helpers**

In `scripts/lib/fit-dixon-coles.mjs`, add these two new exports (place them near the top, after the `MILLISECONDS_PER_DAY` constant and before `tauGradients`):

```js
export function computeEffectiveMatchCounts(matches, teamIds, { xi, referenceDate }) {
  const counts = new Map(teamIds.map((id) => [id, 0]));

  for (const match of matches) {
    const weight = Math.exp((-xi * (referenceDate.getTime() - match.date.getTime())) / MILLISECONDS_PER_DAY);
    if (counts.has(match.homeTeamId)) counts.set(match.homeTeamId, counts.get(match.homeTeamId) + weight);
    if (counts.has(match.awayTeamId)) counts.set(match.awayTeamId, counts.get(match.awayTeamId) + weight);
  }

  return counts;
}

export function linearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: all tests (existing 2 + 3 new = 5) pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fit-dixon-coles.mjs scripts/lib/fit-dixon-coles.test.mjs
git commit -m "feat: add effective-match-count and linear-regression helpers"
```

---

### Task 2: Per-Team Prior And Regularization Strength In `fitDixonColes`

**Files:**
- Modify: `scripts/lib/fit-dixon-coles.mjs`
- Modify: `scripts/lib/fit-dixon-coles.test.mjs`

**Interfaces:**
- Modifies: `fitDixonColes(matches, teamIds, { iterations, learningRate, l2, xi, referenceDate, attackPrior, defensePrior, l2ByTeam } = {})` — `attackPrior`/`defensePrior` are `Map<teamId, number>` defaulting to all-zero; `l2ByTeam` is `Map<teamId, number>` defaulting to `l2` for every team. The regularization term becomes `2 × l2ByTeam.get(id) × (attack.get(id) - attackPrior.get(id))` (and the defense equivalent) instead of the current `2 × l2 × attack.get(id)`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/lib/fit-dixon-coles.test.mjs`:

```js
test("fitDixonColes pulls a data-poor team toward an explicit prior instead of toward zero", () => {
  const teamIds = ["RICH", "POOR"];
  const referenceDate = new Date(2024, 0, 1);
  const matches = [];

  // RICH has plenty of evenly-matched data anchoring it near 0.3/0.1.
  for (let round = 0; round < 40; round += 1) {
    matches.push({
      date: new Date(2023, 0, 1 + round),
      homeTeamId: "RICH",
      awayTeamId: round % 2 === 0 ? "NEUTRAL_A" : "NEUTRAL_B",
      homeGoals: 2,
      awayGoals: 1,
      isNeutralVenue: true
    });
  }
  // POOR has exactly one match, won big -- alone, a zero-prior fit would read this as a very strong attacker.
  matches.push({
    date: new Date(2023, 6, 1),
    homeTeamId: "POOR",
    awayTeamId: "NEUTRAL_A",
    homeGoals: 6,
    awayGoals: 0,
    isNeutralVenue: true
  });

  const allTeamIds = ["RICH", "POOR", "NEUTRAL_A", "NEUTRAL_B"];
  const attackPrior = new Map(allTeamIds.map((id) => [id, id === "POOR" ? -0.5 : 0]));
  const defensePrior = new Map(allTeamIds.map((id) => [id, 0]));
  const l2ByTeam = new Map(allTeamIds.map((id) => [id, id === "POOR" ? 0.5 : 0.001]));

  const withPrior = fitDixonColes(matches, allTeamIds, {
    iterations: 2000,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate,
    attackPrior,
    defensePrior,
    l2ByTeam
  });
  const withoutPrior = fitDixonColes(matches, allTeamIds, {
    iterations: 2000,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate
  });

  assert.ok(
    withPrior.attack.get("POOR") < withoutPrior.attack.get("POOR"),
    `expected the strong prior+regularization to pull POOR's attack down toward -0.5 (got ${withPrior.attack.get("POOR")}) compared to the zero-prior fit (got ${withoutPrior.attack.get("POOR")})`
  );
});

test("fitDixonColes with default prior/l2ByTeam options behaves exactly as before", () => {
  const teamIds = ["A", "B"];
  const referenceDate = new Date(2024, 0, 1);
  const matches = [{ date: new Date(2023, 0, 1), homeTeamId: "A", awayTeamId: "B", homeGoals: 2, awayGoals: 0, isNeutralVenue: true }];

  const result = fitDixonColes(matches, teamIds, { iterations: 50, learningRate: 0.3, l2: 0.001, xi: 0.001, referenceDate });

  assert.ok(Number.isFinite(result.attack.get("A")));
  assert.ok(Number.isFinite(result.defense.get("B")));
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: the new "pulls a data-poor team toward an explicit prior" test FAILs (current code has no `attackPrior`/`l2ByTeam` options, so passing them does nothing); the "default options" test passes already (it's just confirming today's behavior, included so a later refactor can't silently break it).

- [ ] **Step 3: Update `fitDixonColes`**

In `scripts/lib/fit-dixon-coles.mjs`, replace the full `fitDixonColes` function:

```js
export function fitDixonColes(
  matches,
  teamIds,
  {
    iterations = 300,
    learningRate = 0.1,
    l2 = 0.001,
    xi = 0.001,
    referenceDate,
    attackPrior = new Map(teamIds.map((id) => [id, 0])),
    defensePrior = new Map(teamIds.map((id) => [id, 0])),
    l2ByTeam = new Map(teamIds.map((id) => [id, l2]))
  } = {}
) {
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
      const teamL2 = l2ByTeam.get(id);
      attack.set(id, attack.get(id) + learningRate * (meanAttackGrad - 2 * teamL2 * (attack.get(id) - attackPrior.get(id))));
      defense.set(id, defense.get(id) + learningRate * (meanDefenseGrad - 2 * teamL2 * (defense.get(id) - defensePrior.get(id))));
    }
    homeAdvantage += learningRate * (homeAdvantageGrad / totalWeight);
    rho += learningRate * (rhoGrad / totalWeight);
  }

  return { attack, defense, homeAdvantage, rho };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: all tests pass (existing parameter-recovery and recency-weighting tests still pass since the new options default to identical behavior; both new tests pass).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fit-dixon-coles.mjs scripts/lib/fit-dixon-coles.test.mjs
git commit -m "feat: support per-team prior and regularization strength in fitDixonColes"
```

---

### Task 3: Empirical-Bayes Orchestration — `fitDixonColesWithFifaRankPrior`

**Files:**
- Modify: `scripts/lib/fit-dixon-coles.mjs`
- Modify: `scripts/lib/fit-dixon-coles.test.mjs`

**Interfaces:**
- Consumes: `fitDixonColes`, `computeEffectiveMatchCounts`, `linearRegression` (Tasks 1-2, same file).
- Produces: `fitDixonColesWithFifaRankPrior(matches, teamIds, fifaRankingByTeamId, options) => { attack, defense, homeAdvantage, rho }` where `fifaRankingByTeamId` is a `Map<teamId, number>` covering only the teams that have a real ranking (the 48 World Cup teams) — teams not present in this map are treated as having no FIFA-rank-based prior.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/fit-dixon-coles.test.mjs`:

```js
import { fitDixonColesWithFifaRankPrior } from "./fit-dixon-coles.mjs";

function buildReliableNetwork(reliableTeamCount, rounds) {
  const teamIds = Array.from({ length: reliableTeamCount }, (_, index) => `TEAM_${index}`);
  const matches = [];
  let dayOffset = 0;

  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < teamIds.length; index += 1) {
      const home = teamIds[index];
      const away = teamIds[(index + 1) % teamIds.length];
      // Lower-indexed teams score a bit more -- a real, fittable attack/defense gradient.
      matches.push({
        date: new Date(2023, 0, 1 + dayOffset),
        homeTeamId: home,
        awayTeamId: away,
        homeGoals: Math.max(0, 2 - Math.floor(index / 3)),
        awayGoals: Math.max(0, 1 + Math.floor(index / 4)),
        isNeutralVenue: true
      });
      dayOffset += 1;
    }
  }
  return { teamIds, matches };
}

test("fitDixonColesWithFifaRankPrior pulls a one-match team toward its FIFA-rank-implied value", () => {
  // 20 rounds x 2 matches/team/round = 40 matches/team, comfortably above the 30-effective-match
  // reliability bar (near-1.0 weight per match at this xi/timespan, verified empirically).
  const { teamIds: reliableTeamIds, matches: reliableMatches } = buildReliableNetwork(12, 20);
  const referenceDate = new Date(2024, 0, 1);

  const allTeamIds = [...reliableTeamIds, "ONE_MATCH_WONDER"];
  const matches = [
    ...reliableMatches,
    {
      date: new Date(2023, 11, 1),
      homeTeamId: "ONE_MATCH_WONDER",
      awayTeamId: reliableTeamIds[0],
      homeGoals: 9,
      awayGoals: 0,
      isNeutralVenue: true
    }
  ];

  // Give ONE_MATCH_WONDER the worst possible FIFA ranking -- the prior should pull its
  // freak 9-0 win back down, not let one match make it look like the best attacker in the fit.
  const fifaRankingByTeamId = new Map(reliableTeamIds.map((id, index) => [id, index + 1]));
  fifaRankingByTeamId.set("ONE_MATCH_WONDER", 200);

  const withPrior = fitDixonColesWithFifaRankPrior(matches, allTeamIds, fifaRankingByTeamId, {
    iterations: 1500,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate
  });
  const withoutPrior = fitDixonColes(matches, allTeamIds, {
    iterations: 1500,
    learningRate: 0.3,
    l2: 0.001,
    xi: 0.0001,
    referenceDate
  });

  assert.ok(
    withPrior.attack.get("ONE_MATCH_WONDER") < withoutPrior.attack.get("ONE_MATCH_WONDER"),
    "the FIFA-rank prior should pull a sparse, lucky-result team's attack down from the plain zero-prior fit"
  );
});

test("fitDixonColesWithFifaRankPrior throws when fewer than 5 teams meet the reliability bar", () => {
  const { teamIds, matches } = buildReliableNetwork(3, 6);
  const fifaRankingByTeamId = new Map(teamIds.map((id, index) => [id, index + 1]));

  assert.throws(
    () => fitDixonColesWithFifaRankPrior(matches, teamIds, fifaRankingByTeamId, {
      iterations: 100,
      learningRate: 0.3,
      l2: 0.001,
      xi: 0.0001,
      referenceDate: new Date(2024, 0, 1)
    }),
    /reliab/i
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: FAIL — `fitDixonColesWithFifaRankPrior` isn't exported yet.

- [ ] **Step 3: Implement the orchestration function**

In `scripts/lib/fit-dixon-coles.mjs`, add this export after `fitDixonColes`:

```js
const RELIABLE_EFFECTIVE_MATCH_COUNT = 30;
const REFERENCE_EFFECTIVE_MATCH_COUNT = 100;

export function fitDixonColesWithFifaRankPrior(matches, teamIds, fifaRankingByTeamId, options) {
  const baseline = fitDixonColes(matches, teamIds, options);
  const effectiveMatchCounts = computeEffectiveMatchCounts(matches, teamIds, options);

  const reliableTeamIds = teamIds.filter(
    (id) => fifaRankingByTeamId.has(id) && effectiveMatchCounts.get(id) >= RELIABLE_EFFECTIVE_MATCH_COUNT
  );
  if (reliableTeamIds.length < 5) {
    throw new Error(
      `Only ${reliableTeamIds.length} team(s) met the reliability bar (effective match count >= ${RELIABLE_EFFECTIVE_MATCH_COUNT}); need at least 5 to fit a trustworthy FIFA-rank regression.`
    );
  }

  const attackRegression = linearRegression(
    reliableTeamIds.map((id) => ({ x: Math.log(fifaRankingByTeamId.get(id)), y: baseline.attack.get(id) }))
  );
  const defenseRegression = linearRegression(
    reliableTeamIds.map((id) => ({ x: Math.log(fifaRankingByTeamId.get(id)), y: baseline.defense.get(id) }))
  );

  const attackPrior = new Map(teamIds.map((id) => [id, 0]));
  const defensePrior = new Map(teamIds.map((id) => [id, 0]));
  for (const id of teamIds) {
    if (!fifaRankingByTeamId.has(id)) continue;
    const logRank = Math.log(fifaRankingByTeamId.get(id));
    attackPrior.set(id, attackRegression.slope * logRank + attackRegression.intercept);
    defensePrior.set(id, defenseRegression.slope * logRank + defenseRegression.intercept);
  }

  const l2Base = options.l2 ?? 0.001;
  const l2ByTeam = new Map(
    teamIds.map((id) => [id, l2Base * (REFERENCE_EFFECTIVE_MATCH_COUNT / Math.max(effectiveMatchCounts.get(id), 1))])
  );

  return fitDixonColes(matches, teamIds, { ...options, attackPrior, defensePrior, l2ByTeam });
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/fit-dixon-coles.test.mjs
```
Expected: all tests pass (9 total: 2 original + 3 from Task 1 + 2 from Task 2 + 2 from this task).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fit-dixon-coles.mjs scripts/lib/fit-dixon-coles.test.mjs
git commit -m "feat: add empirical-Bayes FIFA-rank-prior fitting orchestration"
```

---

### Task 4: `excludeUpcomingWorldCup` Option In The Data Loader

**Files:**
- Modify: `scripts/lib/historical-results.mjs`
- Modify: `scripts/lib/historical-results.test.mjs`

**Interfaces:**
- Modifies: `loadCompetitiveMatches(csvText, { excludeUpcomingWorldCup = true } = {})`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/lib/historical-results.test.mjs` (reuse the existing `sampleCsv` constant already defined in that file — it already has a played 2026 World Cup row, `Mexico,South Africa,2,0`, and an unplayed one, `Korea Republic,Czechia,NA,NA`):

```js
test("excludeUpcomingWorldCup: false keeps already-played 2026 World Cup rows but still drops unplayed ones", () => {
  const matches = loadCompetitiveMatches(sampleCsv, { excludeUpcomingWorldCup: false });

  assert.ok(
    matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"),
    "the played 2026 World Cup match should now be kept"
  );
  assert.ok(
    !matches.some((match) => match.homeTeamId === "KOR"),
    "the unplayed (NA-score) 2026 World Cup match must still be dropped regardless of this flag"
  );
});

test("excludeUpcomingWorldCup defaults to true, matching today's behavior", () => {
  const matches = loadCompetitiveMatches(sampleCsv);

  assert.ok(!matches.some((match) => match.homeTeamId === "MEX" && match.awayTeamId === "RSA"));
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test scripts/lib/historical-results.test.mjs
```
Expected: the new "excludeUpcomingWorldCup: false" test FAILs (current `loadCompetitiveMatches` takes no options and always excludes); the "defaults to true" test already passes.

- [ ] **Step 3: Update `loadCompetitiveMatches`**

In `scripts/lib/historical-results.mjs`, replace:

```js
export function loadCompetitiveMatches(csvText) {
  const lines = csvText.trim().split("\n");
  const matches = [];

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [date, homeTeam, awayTeam, homeScore, awayScore, tournament, , , neutral] = parseCsvLine(line);

    if (tournament === "Friendly") continue;
    if (tournament === "FIFA World Cup" && date >= "2026-01-01") continue;
    if (homeScore === "NA" || awayScore === "NA") continue;
```

with:

```js
export function loadCompetitiveMatches(csvText, { excludeUpcomingWorldCup = true } = {}) {
  const lines = csvText.trim().split("\n");
  const matches = [];

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [date, homeTeam, awayTeam, homeScore, awayScore, tournament, , , neutral] = parseCsvLine(line);

    if (tournament === "Friendly") continue;
    if (excludeUpcomingWorldCup && tournament === "FIFA World Cup" && date >= "2026-01-01") continue;
    if (homeScore === "NA" || awayScore === "NA") continue;
```

(The rest of the function body is unchanged.)

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test scripts/lib/historical-results.test.mjs
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/historical-results.mjs scripts/lib/historical-results.test.mjs
git commit -m "feat: let loadCompetitiveMatches optionally include the in-progress World Cup"
```

---

### Task 5: Wire The Training Script And Retrain For Real

**Files:**
- Modify: `scripts/train-prediction-model.mjs`
- Modify: `packages/tournament-engine/src/data/team-strength.js` (regenerated by running the script — not hand-edited)

**Interfaces:**
- Consumes: `fitDixonColesWithFifaRankPrior` (Task 3), `excludeUpcomingWorldCup` option (Task 4), `teams` (for `fifaRanking`) from `packages/tournament-engine/src/data/teams.js`.

- [ ] **Step 1: Update the training script**

Read the current full contents of `scripts/train-prediction-model.mjs` first (it was written in an earlier plan and may have been touched since — don't guess its exact current text). Apply these changes to it:

1. Add an import: `import { teams } from "../packages/tournament-engine/src/data/teams.js";` and change the `fitDixonColes` import to `fitDixonColesWithFifaRankPrior`.
2. After computing `teamIds` and before fitting, add:

```js
const includeCurrentTournament = process.argv.includes("--include-current-tournament");
const fifaRankingByTeamId = new Map(teams.map((team) => [team.id, team.fifaRanking]));
```

3. Change the `loadCompetitiveMatches(csvText)` call to `loadCompetitiveMatches(csvText, { excludeUpcomingWorldCup: !includeCurrentTournament })`.
4. Change the fitting call from `fitDixonColes(matches, teamIds, { iterations: 20000, learningRate: 0.3, l2: 0.001, xi: 0.0001, referenceDate })` to `fitDixonColesWithFifaRankPrior(matches, teamIds, fifaRankingByTeamId, { iterations: 20000, learningRate: 0.3, l2: 0.001, xi: 0.0001, referenceDate })`.
5. Add a log line right after loading matches: `console.log(includeCurrentTournament ? "Including already-played 2026 World Cup matches." : "Excluding the 2026 World Cup entirely (default).");`

- [ ] **Step 2: Run it for real (default, frozen-snapshot mode)**

```bash
node scripts/train-prediction-model.mjs
```
Expected: succeeds, no `NaN`, logs "Excluding the 2026 World Cup entirely (default)."

- [ ] **Step 3: Verify the Australia/Argentina fix this whole feature exists for**

```bash
node --input-type=module -e "
import { teamStrength } from './packages/tournament-engine/src/data/team-strength.js';
console.log('Australia:', teamStrength.AUS);
console.log('Argentina:', teamStrength.ARG);
"
```
Expected: Argentina's `attack` is now higher than Australia's (the opposite of the bug that motivated this plan — see `docs/model-evaluation-report.md`'s "Known limitation" section). If it isn't, the regression/prior isn't pulling hard enough — check `RELIABLE_EFFECTIVE_MATCH_COUNT`/`REFERENCE_EFFECTIVE_MATCH_COUNT` before assuming the bug is fixed just because the script ran without error.

- [ ] **Step 4: Spot-check the Argentina/Jordan case is still sane**

```bash
node --input-type=module -e "
import { teams } from './packages/tournament-engine/src/data/index.js';
import { predictMatch } from './packages/tournament-engine/src/engine/predictor.js';
const arg = teams.find((t) => t.id === 'ARG');
const jor = teams.find((t) => t.id === 'JOR');
console.log(predictMatch(arg, jor, { isNeutralVenue: true }).probabilities);
"
```
Expected: Argentina's `homeWin` probability still clearly exceeds Jordan's `awayWin` (this was already fixed by the previous plan's `xi` retuning; confirm this new change didn't regress it).

- [ ] **Step 5: Run the full test suite, typecheck, and build**

```bash
npm test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/train-prediction-model.mjs packages/tournament-engine/src/data/team-strength.js
git commit -m "feat: regularize team strength toward a FIFA-rank-informed prior, support in-tournament retraining"
```

---

### Task 6: Wire The Evaluation Script To The Same Fitting Procedure

**Files:**
- Modify: `scripts/evaluate-prediction-model.mjs`
- Modify: `docs/model-evaluation-report.md` (regenerated by running the script — not hand-edited)

**Interfaces:**
- Consumes: `fitDixonColesWithFifaRankPrior` (Task 3).

- [ ] **Step 1: Update the evaluation script**

Read the current full contents of `scripts/evaluate-prediction-model.mjs` first. Apply these changes:

1. Add an import: `import { teams } from "../packages/tournament-engine/src/data/teams.js";` and change the `fitDixonColes` import to `fitDixonColesWithFifaRankPrior`.
2. Before the `fitDixonColes(trainMatches, ...)` call, add: `const fifaRankingByTeamId = new Map(teams.map((team) => [team.id, team.fifaRanking]));`
3. Change the fitting call to `fitDixonColesWithFifaRankPrior(trainMatches, [...trainTeamIds], fifaRankingByTeamId, { iterations: 20000, learningRate: 0.3, l2: 0.001, xi: 0.0001, referenceDate: HOLDOUT_CUTOFF })`.
4. The `loadCompetitiveMatches(csvText)` call stays exactly as-is (no options) — this script must always exclude the 2026 World Cup regardless of the production training script's flag, per the Global Constraints.

- [ ] **Step 2: Run the backtest for real**

```bash
node scripts/evaluate-prediction-model.mjs
```
Expected: succeeds; prints accuracy/log-loss/Brier-score numbers and rewrites `docs/model-evaluation-report.md`.

- [ ] **Step 3: Compare against the previous report**

```bash
git diff docs/model-evaluation-report.md
```
Read the diff: accuracy/log-loss/Brier score will likely shift slightly (the fitting procedure changed) — confirm log loss still beats the 1.0986 naive baseline and Brier score still beats 0.667 (same acceptance bar as the original plan). If either regresses past the baseline, stop and investigate before committing — that would mean the new regularization made the model worse, not better, which would defeat the purpose of this entire plan.

- [ ] **Step 4: Run the full test suite once more**

```bash
npm test
```
Expected: passes (this script change doesn't touch any tested module's public behavior, but confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluate-prediction-model.mjs docs/model-evaluation-report.md
git commit -m "feat: evaluate the FIFA-rank-prior fitting procedure, not the superseded zero-prior one"
```

---

### Task 7: Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete verification suite**

```bash
npm test
npm run ingestion:test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
```
Expected: all exit `0`.

- [ ] **Step 2: Browser-verify the four prediction surfaces once more**

```bash
npm run dev --workspace apps/web
```
Using the `/browse` skill or a regular browser, confirm the Fixtures/Standings/Bracket/Forecast tabs all still render with no console errors, and spot-check that the Forecast tab's title-odds list no longer ranks Australia above Argentina (or any other historically-dominant team) at the top.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/empirical-bayes-retraining
gh pr create --base main --head feat/empirical-bayes-retraining --title "feat: regularize trained model toward FIFA-rank prior, support in-tournament retraining" --body "See docs/superpowers/specs/2026-06-25-fifa-rank-prior-and-live-retraining-design.md and docs/model-evaluation-report.md for the full design and updated backtest results."
```

- [ ] **Step 4: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.
