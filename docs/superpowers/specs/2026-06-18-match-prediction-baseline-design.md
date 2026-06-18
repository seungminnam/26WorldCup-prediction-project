# Match Prediction Baseline Design

## Goal

Before the 2026-06-19 group-stage matches begin, show real schedule/results when available and provide an honest, deterministic baseline for home-win, draw, away-win, and likely-score probabilities.

This is not presented as a trained ML model. A trained model follows after a historical dataset, temporal validation split, and calibration metrics are available.

## Time-Boxed Scope

Codex owns the prediction baseline and its UI presentation. Claude owns the existing ESPN ingestion worktree and prioritizes the shortest real-data path: fetch, mapping review/import, dry sync, apply, and UI data verification.

The following work is deferred until the live path is usable:

- football-data.org reconciliation CLI (provider transition Task 7)
- provider-selection migration cleanup (Task 8), unless needed to unblock writes
- historical-data collection and ML training
- automated model retraining or model registry infrastructure

## Architecture

### Prediction Engine

Extend the tournament engine with a pure match-prediction function. It uses the existing team ratings and independent Poisson goal distributions to return:

- home-win probability
- draw probability
- away-win probability
- most likely score
- a short ranked list of likely scorelines

Probabilities must sum to one within floating-point tolerance. The score grid must include enough goals to capture nearly all probability mass, with any truncated tail normalized before returning results.

The existing Monte Carlo tournament API remains compatible. No persisted model artifact or network dependency is introduced.

### UI

Upcoming fixture cards receive a compact prediction block showing W/D/L percentages and the most likely score. The UI must label the output as a rating/Poisson baseline rather than an ML-trained forecast.

The match centre also displays whether its tournament data came from Supabase or the static seed fallback. This makes the real-data validation visible instead of relying on developer inspection.

Completed matches continue to emphasize actual results and do not substitute predictions for known scores.

## Data Flow

1. `getTournamentData()` loads Supabase fixtures and teams, falling back to seed data on missing configuration, query errors, or empty results.
2. The match-centre component receives the existing `TournamentData.source` value.
3. For each upcoming fixture with known participants, the UI calls the pure prediction function using the current team ratings.
4. ESPN ingestion can update Supabase independently. The existing page revalidation path then supplies updated statuses and scores without coupling ingestion code to prediction code.

## Error Handling

- Missing teams or invalid ratings must not crash the fixture list; the prediction block is omitted.
- Returned probabilities must be finite and non-negative.
- Seed fallback must be visibly identified.
- No claim of model training, live accuracy, or calibration is shown before those processes exist.

## Verification

- Unit tests cover probability normalization, symmetry for equally rated teams, rating direction, and likely-score ordering.
- Existing tournament simulation tests remain green.
- Web typecheck and production build pass.
- Browser verification confirms the source badge and prediction block render on the fixture view.
- Claude's ingestion verification separately confirms at least one Supabase-backed real fixture/result.

## Later ML Phase

The trained model begins only after collecting a versioned historical international-match dataset. The first candidate should remain interpretable: a calibrated Poisson or Dixon-Coles model with team strength, home/neutral venue, recency, and competition importance features. Evaluation uses chronological holdouts and reports log loss, Brier score, ranked probability score, calibration, and scoreline likelihood against the baseline in this document.

