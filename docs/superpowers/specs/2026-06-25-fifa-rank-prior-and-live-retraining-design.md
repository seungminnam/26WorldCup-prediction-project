# FIFA-Rank-Informed Prior And In-Tournament Retraining Design

## Goal

Two related improvements to the trained Dixon-Coles prediction model (shipped in PR #20):

1. Fix a confirmed accuracy problem — teams whose entire historical schedule skews toward weak regional opposition (e.g. Australia, fitted at a higher attack rating than Argentina) get an inflated rating that no amount of recency-window tuning fixes, because it's a lifetime pattern, not a recent-form one.
2. Let the model optionally incorporate the current World Cup's own already-played results, so a team's in-tournament form can inform predictions of its remaining matches — without permanently anchoring future (e.g. 2030) predictions to 2026 specifically.

## Context

`scripts/lib/fit-dixon-coles.mjs`'s `fitDixonColes` currently regularizes every team's `attack`/`defense` toward zero with a single fixed `l2` constant, regardless of how much real data informs that team's estimate. `scripts/lib/historical-results.mjs`'s `loadCompetitiveMatches` unconditionally excludes every `tournament === "FIFA World Cup"` row dated `2026-01-01` or later, including already-played 2026 group matches, so the model is permanently frozen at its initial training point. `packages/tournament-engine/src/data/teams.js`'s 48 World Cup teams each carry a real `fifaRanking` field (added for the FIFA tiebreaker feature), currently unused by the prediction model.

## Decision

### 1. FIFA-rank-informed regularization (empirical Bayes, two-pass fitting)

Regularizing toward zero assumes every team is "average" in the absence of data — wrong for a team we have independent, trustworthy evidence about (their FIFA ranking) even when their own match history is thin or skewed. Empirical Bayes fits this exactly: derive the prior *from the data itself*, then regularize toward that prior instead of toward zero.

**Pass 1 (baseline):** Fit exactly as today — `fitDixonColes(matches, teamIds, options)` with the existing zero-centered regularization. This produces a baseline `attack`/`defense` for every team in the network (not just the 48 World Cup teams).

**Effective match count:** For each team, sum the recency-decay `weight` (already computed inside `fitDixonColes` for the likelihood) across every match they appear in. This is the existing per-match weight, just accumulated per team rather than discarded — a team with a long, well-connected history has a high effective count even if heavily time-decayed; a team with a short or sparse history has a low one.

**Regression:** Among the 48 World Cup teams only (the only teams with a real `fifaRanking`), keep those with effective match count ≥ 30 ("reliable"). Fit two ordinary-least-squares lines, `attack ≈ slope_a · ln(fifaRanking) + intercept_a` and `defense ≈ slope_d · ln(fifaRanking) + intercept_d`, using the reliable teams' Pass-1 baseline values as the regression targets. `ln(fifaRanking)` (not raw rank) because the gap between rank 1 and rank 10 is far more meaningful than between rank 80 and rank 89.

**Prior:** For each of the 48 World Cup teams, `attackPrior = slope_a · ln(fifaRanking) + intercept_a` (same for defense). Every other team in the network (no `fifaRanking` available) keeps a prior of `0`, unchanged from today.

**Degenerate-input safety:** if fewer than 5 World Cup teams meet the "reliable" bar, the regression would be fit on too little data to trust — throw a clear error naming how many qualified, rather than silently fitting a line through 1-4 points and using it as a prior for all 48 teams. (In practice this should never fire: most World Cup teams have hundreds of historical matches.)

**Per-team regularization strength:** Non-World-Cup teams (no `fifaRanking`) keep `l2ByTeam[id] = baseL2 × (100 / max(effectiveMatchCount[id], 1))` — strengthens as their data thins out, weakens as it grows, same as before. **World Cup teams get a fixed `l2ByTeam[id] = 0.01`, independent of effective match count.** This was changed after real retraining (Task 5) showed the effective-match-count-scaled formula failing on its own motivating case: Australia and Argentina both have well over 100 effective matches, so the original formula gave them an `l2` at or below the un-regularized baseline — negligible pull toward the FIFA-rank prior precisely for the two teams this feature was built to fix. The bias here isn't sample-size noise (which shrinks with more data); it's a confound between match history and true skill (Australia's record is large *and* skewed toward weak regional opponents) that doesn't shrink with more matches. A fixed pull, validated empirically across `l2 ∈ {0.005, 0.01, 0.02, 0.04, 0.08}` (all flip Argentina above Australia, all stable, no divergence), corrects this regardless of how much history a World Cup team has. `0.01` was chosen as a comfortably stable middle value with a clear margin (Argentina 0.82 vs Australia 0.70 in the validation sweep) without pushing toward the instability seen at `0.05`+ under the old uniform-l2 approach.

**Pass 2 (final):** Refit with the same `matches`/`teamIds` but using `attackPrior`/`defensePrior`/`l2ByTeam` instead of the flat zero-prior/`l2`. This is the fit `scripts/train-prediction-model.mjs` and `scripts/evaluate-prediction-model.mjs` both call going forward.

`homeAdvantage` and `rho` are not regularized at all (unchanged from today — they're global scalars, not a per-team family needing this treatment).

### 2. Optional in-tournament retraining

`loadCompetitiveMatches` gains an `excludeUpcomingWorldCup` option (default `true`, preserving today's behavior exactly). When `false`, the existing `tournament === "FIFA World Cup" && date >= "2026-01-01"` filter is skipped entirely — already-played 2026 matches (real scores, not `NA`) flow into training like any other competitive match; not-yet-played ones are still dropped by the existing, unconditional `homeScore === "NA"` check, so no future information can leak in regardless of this flag.

`scripts/train-prediction-model.mjs` gains a `--include-current-tournament` CLI flag. Without it, training behaves exactly as it does today (frozen pre-tournament snapshot). With it, `loadCompetitiveMatches` is called with `excludeUpcomingWorldCup: false`, so whichever 2026 group/knockout matches have been played by the time someone runs the script get folded into the same training run, the same way any other recent match would.

**Why this doesn't permanently anchor future tournaments to 2026:** nothing new is needed — the existing recency-decay weighting (`ξ`) already handles this. By the time the 2030 tournament needs predicting, 2026's matches are just ~4-year-old data like any other past tournament, automatically down-weighted by the same mechanism that already de-emphasizes old results. There is no special "this was the 2026 World Cup" flag carried forward; a match is a match.

**Why this doesn't overfit to 2-3 new matches:** no additional safeguard is needed beyond what's already being built in Decision 1. A team with hundreds of historical matches plus 2-3 fresh 2026 results has its effective match count barely move, so the FIFA-rank-informed regularization (which doesn't shift just because of a couple of new results — a team's `fifaRanking` itself updates slowly) continues to anchor it; a handful of new, surprising results can shift the *mean* in the right direction without the model swinging wildly off the back of a small sample, by construction.

Cadence is a manual `node scripts/train-prediction-model.mjs --include-current-tournament` run, not an automated schedule — consistent with training's existing one-time/manual design.

## Components

- `scripts/lib/fit-dixon-coles.mjs` — `fitDixonColes` gains `attackPrior`/`defensePrior`/`l2ByTeam` options, each defaulting to today's zero-prior/flat-`l2` behavior (so existing tests/callers are unaffected unless they opt in). New exported `computeEffectiveMatchCounts(matches, teamIds, { xi, referenceDate })`. New exported `fitDixonColesWithFifaRankPrior(matches, teamIds, fifaRankingByTeamId, options)` orchestrating the two passes.
- `scripts/lib/historical-results.mjs` — `loadCompetitiveMatches` gains the `excludeUpcomingWorldCup` option.
- `scripts/train-prediction-model.mjs` — calls `fitDixonColesWithFifaRankPrior` instead of `fitDixonColes`, passing `fifaRanking` read from `packages/tournament-engine/src/data/teams.js`; parses `--include-current-tournament` from `process.argv`.
- `scripts/evaluate-prediction-model.mjs` — also switches to `fitDixonColesWithFifaRankPrior` so the backtest evaluates the same fitting procedure the production model actually uses (not the now-superseded plain zero-prior fit). Always trains with `excludeUpcomingWorldCup: true` regardless of the production flag — backtesting must stay strictly historical so the holdout methodology already validated isn't disturbed.

## Testing

- `computeEffectiveMatchCounts`: a team with more/heavier-weighted matches gets a higher count than one with fewer/older ones, on a small synthetic dataset with known weights.
- A simple OLS linear-regression helper (new, small, internal to `fit-dixon-coles.mjs`): recovers known slope/intercept from synthetic points lying exactly on a line.
- `fitDixonColesWithFifaRankPrior`: on synthetic data where a "data-poor" team's true attack matches what its (synthetic) FIFA ranking implies but its raw fitted value (from too little data) doesn't, the empirical-Bayes fit lands closer to the FIFA-rank-implied value than the plain zero-prior fit does for the same team.
- `loadCompetitiveMatches`'s `excludeUpcomingWorldCup: false`: an already-played 2026 World Cup row (real score) is kept; a not-yet-played one (`NA` score) is still dropped regardless of the flag.
- Re-run the full existing test suite (`fit-dixon-coles.test.mjs`, `evaluation-metrics.test.mjs`, `historical-results.test.mjs`) to confirm the new optional parameters don't change default behavior.
- Re-run training for real (both with and without `--include-current-tournament`) and re-check the Australia/Argentina comparison that motivated this work, plus the existing Argentina/Jordan spot-check, before treating the new model as trustworthy — the same empirical-verification discipline used the first time, not just "tests pass."

## Non-Goals

- No automated/scheduled retraining — manual flag only.
- No confederation-level modeling — the FIFA-rank regression is a simpler, already-available proxy for "how good a team's typical opposition really was," not a structural confederation-strength model.
- No special-cased handling for whether a 2026 match happened "in this World Cup" once it's in the training set — it's treated as an ordinary recent competitive match, with the existing recency weighting doing all the work of eventually de-emphasizing it.
- No backtest changes to validate the in-tournament-retraining behavior specifically (Decision 2) — by definition there's no "held-out future World Cup" to backtest against; Decision 1's regularization is what `evaluate-prediction-model.mjs` re-validates, and Decision 2 only changes what data is available at training time, not the fitting procedure itself.
