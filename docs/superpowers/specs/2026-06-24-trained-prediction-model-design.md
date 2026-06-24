# Trained Prediction Model Design

## Goal

Replace the hand-tuned, explicitly self-labeled `"trained": false` baseline (`expectedGoals`/`winProbability` in `packages/tournament-engine/src/engine/predictor.js`, currently a linear function of the made-up `rating` field) with a real statistical model whose parameters are fitted from actual historical international football results. This single change propagates to every prediction surface in the app: the Fixtures tab's per-match "Likely" scoreline, the Projected Group Tables, the Bracket projection, and the per-match Stakes scenarios — all of them call `predictMatch`/`simulateScore`/`pickKnockoutWinner`, which all derive from `expectedGoals`/`winProbability`.

## Context

`predictor.js` currently computes `expectedGoals(teamA, teamB)` as `1.25 + clamp((teamA.rating - teamB.rating) / 450, -0.85, 0.85)`, and `winProbability(teamA, teamB)` as a separate Elo-style logistic function of the same rating difference. Both `rating` (hand-set per team in `packages/tournament-engine/src/data/teams.js`) and the formulas themselves are arbitrary — no historical match data informs either. The code already flags this honestly: `PREDICTION_MODEL = { id: "rating-poisson-v1", label: "Rating + Poisson baseline", trained: false }`.

## Decision

### Model: Dixon-Coles

Use the Dixon-Coles model (Dixon & Coles, 1997), the standard statistical approach for football scoreline prediction, fitted via maximum likelihood on real historical match data. It fits naturally onto the existing architecture, which already treats home and away goals as independent Poisson draws (`samplePoisson`/`simulateScore`) — Dixon-Coles keeps that same shape and replaces the ad-hoc lambda formula with properly fitted parameters, plus a small correction for the real-world correlation between low scores (0-0, 1-0, 0-1, 1-1 are all slightly more common than two independent Poisson draws would predict).

**Per-team parameters:** `attack[team]` and `defense[team]`, fitted for every team that appears in the filtered historical dataset (several hundred national teams — fitting needs the full network of historical results to calibrate relative strength, not just the 48 World Cup teams). Higher `attack` means more goals scored; higher `defense` means more goals conceded (i.e., a *good* defense has a *low* `defense` value).

**Global parameters:** `homeAdvantage` and `rho` (the Dixon-Coles low-score correlation correction).

**Neutral-venue determination for the 2026 tournament:** `expectedGoals`/`winProbability` take an explicit `isNeutralVenue` argument rather than inferring it from which side a fixture happens to label `homeTeamId` (that label is just the official schedule's designation, not a signal of actual host-country advantage). The caller (`simulateGroupMatch`, `predictMatch`'s call sites, knockout simulation) sets `isNeutralVenue = false` only when the fixture's `homeTeamId` is one of the three co-hosts — Mexico, Canada, or the United States — and `true` otherwise. This is a deliberate simplification: a host nation's *group-stage* matches are scheduled in its own country, so the check is accurate there; a host nation's *knockout-stage* matches could in principle be played in a different host country's stadium, where this simplification would incorrectly grant a small home-advantage boost. Documented as an accepted limitation rather than building full venue-city-to-country geocoding for a rare edge case.

**Expected goals:**
```
λ_home = exp(attack[home] - defense[away] + (isNeutralVenue ? 0 : homeAdvantage))
λ_away = exp(attack[away] - defense[home])
```

**Joint scoreline probability** (replaces the current independent-Poisson product):
```
P(home=x, away=y) = τ(x, y; rho) × Poisson(x; λ_home) × Poisson(y; λ_away)

τ(0,0) = 1 - λ_home·λ_away·rho
τ(0,1) = 1 + λ_home·rho
τ(1,0) = 1 + λ_away·rho
τ(1,1) = 1 - rho
τ(x,y) = 1  for all other (x,y)
```

**`winProbability(teamA, teamB)`** changes from its own separate Elo logistic formula to: sum the joint scoreline grid (same grid `predictMatch` already builds) for `P(homeGoals > awayGoals) + 0.5 × P(homeGoals == awayGoals)` — deriving win probability from the *same* fitted model instead of a second, independent formula. This fixes an existing inconsistency where group-stage scorelines and knockout-stage win/loss draws were silently driven by two different models.

**Fitting:** maximum likelihood over all filtered historical matches, weighted by recency: `weight(match) = exp(-ξ × daysSince(match) / 365)`, the standard Dixon-Coles time-decay. `ξ = 0.0065` per day (the value reported in Dixon & Coles' original paper and widely reused in follow-up football-analytics work, corresponding to a multi-year effective half-life) — used directly rather than grid-searched, to avoid a three-way train/validation/test split for what would be a marginal tuning gain; `evaluate-prediction-model.mjs`'s holdout backtest independently reports how well-calibrated the resulting model actually is, which is the real check that matters here. Attack/defense/homeAdvantage/rho are fit via numerical gradient descent minimizing the negative log-likelihood, with a small L2 regularization term (`λ_reg × (Σ attack[i]² + Σ defense[i]²)`) — this both keeps the parameters identifiable (Dixon-Coles attack/defense values are only meaningful relative to each other; without a constraint they could drift by an arbitrary additive shift) and prevents overfitting for teams with sparse historical data (e.g., recently-FIFA-recognized nations).

### Data: martj42/international_results

CC0 (public domain) historical international results, 1872–present, covering ~45,000 matches with date, home/away team names, score, tournament name, and venue. Vendor a snapshot into the repo (`scripts/data/international-results.csv` + a `SOURCE.md` noting the exact source URL, license, and fetch date) rather than downloading at training time, so training is fully reproducible from repo contents alone and never depends on an external URL staying alive.

**Filter:** keep only competitive matches — exclude rows whose `tournament` field indicates a friendly (the dataset's `tournament` column distinguishes "Friendly" from real competitions like World Cup, World Cup qualifiers, continental championships). Friendlies are excluded rather than down-weighted: squad rotation and low stakes make them a weaker, noisier signal, and excluding them keeps the filtering rule simple and auditable.

**Team name normalization:** the dataset uses full country names (e.g., "Korea Republic", "IR Iran") that need mapping to this project's internal IDs (e.g., "KOR", "IRN"). Build an explicit mapping table covering every team name that appears in the filtered dataset, not just the 48 World Cup teams (since e.g. Brazil's fitted strength is informed by all of Brazil's historical opponents, not just the ones who also qualified for 2026). Unmapped names are skipped per-match with a warning (not a hard failure) — a single unrecognized historical entry shouldn't block the whole training run — but after fitting, assert every one of the 48 World Cup 2026 teams has at least 10 matches in the filtered, mapped dataset; throw a clear, specific error naming any team that doesn't, rather than silently shipping an underfit team.

### Integration: additive, not replacing `rating`

`rating` stays exactly as it is — it's used as a tiebreaker sort key in `ranking.js`, `thirdPlace.js`, and `simulator.js`'s `groupProjections` sort, unrelated to score prediction. The fitted `attack`/`defense` values live in a new file, `packages/tournament-engine/src/data/team-strength.js`, keyed by team ID, holding only the 48 relevant teams' fitted values plus the global `homeAdvantage`/`rho`/training metadata (trained-at date, data source, match count). `predictor.js` imports from this new file instead of reading `team.rating`. Keeping it a separate file (rather than adding fields to `teams.js`) means re-training only ever touches one generated file, never the hand-maintained team list.

### Training cadence: one-time script, not a recurring job

Mirrors the existing FIFA World Ranking snapshot pattern in this codebase — a one-time, manually-invoked script (`node scripts/train-prediction-model.mjs`), not a scheduled GitHub Actions job. Team strength built from over a century of historical results doesn't meaningfully shift week to week; if a refresh is ever wanted (e.g., before the next World Cup, or once to fold in newly-completed 2026 matches), someone reruns the script by hand and commits the regenerated `team-strength.js`, the same way the FIFA ranking snapshot would be refreshed.

### Evaluation: offline backtest only, no UI in this pass

A separate script, `node scripts/evaluate-prediction-model.mjs`, holds out the most recent several years of the filtered dataset, fits on everything before that cutoff, and reports how well the held-out matches were predicted — log-loss, Brier score, and simple win/draw/loss accuracy — writing `docs/model-evaluation-report.md`. This report doubles as the methodology write-up for the portfolio's planned README/methodology pass. A live, UI-facing "how well is the model calling real 2026 matches" tracker is an explicitly separate, later piece of work — out of scope here.

## Components

- `scripts/data/international-results.csv` (new) — vendored dataset snapshot.
- `scripts/data/SOURCE.md` (new) — source URL, license, fetch date.
- `scripts/train-prediction-model.mjs` (new) — loads the CSV, filters to competitive matches, normalizes team names to IDs, computes time-decay weights, fits `attack`/`defense`/`homeAdvantage`/`rho` via regularized MLE, asserts every 2026 team has sufficient history, writes `team-strength.js`.
- `scripts/evaluate-prediction-model.mjs` (new) — time-based holdout backtest; writes `docs/model-evaluation-report.md`.
- `packages/tournament-engine/src/data/team-strength.js` (new, generated) — fitted parameters for the 48 World Cup 2026 teams plus global constants.
- `packages/tournament-engine/src/engine/predictor.js` (modified) — `expectedGoals`/`winProbability` rewritten against `team-strength.js`'s Dixon-Coles parameters instead of `rating`; `winProbability` derived from the same scoreline grid `predictMatch` builds, instead of an independent formula; `PREDICTION_MODEL` updated to `{ id: "dixon-coles-v1", trained: true, ... }`.
- `docs/model-evaluation-report.md` (new, generated) — backtest results and methodology.

## Testing

- `predictor.js`: unit tests asserting `expectedGoals`/`winProbability` produce the exact expected lambda/probability for known `attack`/`defense`/`homeAdvantage`/`rho` inputs (replacing the existing rating-based predictor tests).
- Training script's fitting procedure: generate a small synthetic dataset from *known* attack/defense/home-advantage/rho values, then assert the fitting procedure recovers values close to the originals — the standard way to validate a statistical fitting routine when the real historical dataset has no "ground truth" to check against.
- Evaluation script's metric functions (log-loss, Brier score, accuracy): unit tests against hand-computed small examples.
- Every existing test elsewhere in the repo (simulation, sorting, ranking, etc.) should continue passing unmodified — none of them depend on what specific numbers `expectedGoals`/`winProbability` return, only on the shape of their output.

## Non-Goals

- No recurring/scheduled re-training (GitHub Actions, cron) — manual one-time script, matching the existing FIFA ranking snapshot pattern.
- No UI-facing model-accuracy tracker in this pass — that's explicitly the next, separate piece of work.
- No Python/sklearn or other ML tooling — fitting happens in plain Node.js via gradient descent.
- No change to `rating`, the FIFA-ranking-based tiebreaker logic, or any other part of the ranking/bracket engine — this work only touches score/outcome *prediction*, not group-stage tiebreaking.
