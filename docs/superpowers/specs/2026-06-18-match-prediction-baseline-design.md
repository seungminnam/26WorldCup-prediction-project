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

### Model Contract

The UI consumes one provider-neutral prediction contract rather than importing a particular statistical model directly. Every current or future model must return the same shape: W/D/L probabilities, ranked scorelines when supported, model id/version, and a short methodology label.

The first implementation is `rating-poisson-v1`. This keeps tonight's delivery small while allowing later Elo, Dixon-Coles, negative-binomial, classification, or ensemble implementations to be evaluated and swapped without rewriting fixture components.

### Prediction Engine

Extend the tournament engine with a pure match-prediction function. It uses the existing team ratings and independent Poisson goal distributions to return:

- home-win probability
- draw probability
- away-win probability
- most likely score
- a short ranked list of likely scorelines

Probabilities must sum to one within floating-point tolerance. The score grid must include enough goals to capture nearly all probability mass, with any truncated tail normalized before returning results.

The existing Monte Carlo tournament API remains compatible. No persisted model artifact or network dependency is introduced.

### Evidence From The 11-Model Comparison

The referenced Towards Data Science article compares ranking models (Elo, Colley, PageRank), goal distributions (Poisson and negative binomial), several classifiers, and a market benchmark through a standardized W/D/L interface and tournament simulation. Its most useful finding for this project is not a single winning algorithm: different model families select different champions, and complex models can overfit a small international-match sample.

This design therefore adopts the standardized prediction contract and explicit uncertainty, but does not copy all eleven models. New models are admitted only when chronological backtests show an improvement over `rating-poisson-v1`. Tournament output should eventually show model spread or ensemble intervals instead of presenting one champion probability as certain.

The article's fitted negative-binomial dispersion is approximately `0.008`, so it produces almost the same probabilities as Poisson on that sample. Its XGBoost example assigns an implausible 64% draw probability to Spain-Morocco, illustrating failed calibration on only 358 matches. The simple multinomial logistic model performs better in cross-validation than the flexible classifiers. These results reinforce the decision to keep tonight's implementation simple and measurable.

The published repository also warns that its strength ratings and market odds are illustrative snapshots. Its 358-match sample under-represents non-European teams and its tournament uses a simplified seeded knockout map. This project must not import its title probabilities or ratings as production data.

Reference: [I Built 11 Models to Predict the 2026 World Cup. They Crown Four Different Champions.](https://towardsdatascience.com/i-built-11-models-to-predict-the-2026-world-cup-they-crown-four-different-champions/)

Reference implementation: [arijoury/world-cup-2026-models](https://github.com/arijoury/world-cup-2026-models)

### UI

Upcoming fixture cards receive a compact prediction block showing W/D/L percentages and the most likely score. The UI must label the output as a rating/Poisson baseline rather than an ML-trained forecast.

The match centre also displays whether its tournament data came from Supabase or the static seed fallback. This makes the real-data validation visible instead of relying on developer inspection.

Completed matches continue to emphasize actual results and do not substitute predictions for known scores.

### Probability Ribbon

The selected visual treatment is a responsive data ribbon:

- Replace generic `Home` and `Away` outcome labels with the actual team names.
- Show team names and percentages in a stable three-column legend above the bar: home team, draw, away team.
- Render a single 100% stacked bar whose segment widths are the unmodified W/D/L percentages.
- Keep the bar free of text so narrow segments never clip labels.
- Do not repeat team-name captions below the bar.
- Never apply a visual `min-width` to a probability segment because it would misrepresent the model output.
- Keep each legend cell readable independently of its segment width; long country names use ellipsis only when the viewport cannot fit them.
- Preserve the likely-score heading, top-three scoreline chips, methodology label, and non-ML disclosure.
- On narrow viewports, retain all three legend cells and reduce typography/spacing rather than stacking outcomes vertically, so the left-to-right bar mapping remains intact.

The component must remain accurate for extreme distributions such as `91% / 8% / 1%`: the 1% segment may be visually thin, while its country name and percentage remain fully readable in the legend.

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

The trained model begins only after collecting a versioned historical international-match dataset. The first candidates are deliberately narrow:

1. dynamic Elo plus calibrated draw probability
2. Dixon-Coles bivariate Poisson with team attack/defence strength
3. a simple regularized multinomial logistic model using rating difference, recency, venue, and competition importance

Tree ensembles or neural networks are evaluated only after these baselines and only if the dataset is large enough. Evaluation uses chronological holdouts and reports log loss, Brier score, ranked probability score, calibration, and scoreline likelihood. A model is not promoted because it names a plausible champion; it must improve held-out probability quality and remain reproducible.

The dataset must cover recent qualifiers, friendlies, continental competitions, and World Cups across every confederation. Each record needs an as-of timestamp so rating and feature generation cannot see future matches. Model comparison must distinguish genuinely independent inputs from models that merely transform the same rating prior.

## Git And Parallel-Work Strategy

- Shared documentation checkpoint: `eab97bb` on `feat/api-football-provider-transition`.
- Prediction implementation branch: `feat/match-prediction-baseline`.
- Prediction implementation worktree: `.worktrees/match-prediction-baseline`.
- Branch and commit names describe product behavior and never identify the tool or agent that produced them.
- Commits follow the repository's existing Conventional Commit form, for example `feat: add match outcome probability baseline` and `feat: show fixture prediction probabilities`.
- The prediction branch changes only tournament-engine and match-centre presentation files. The ingestion branch retains provider, mapping, sync, migration, environment, and deployment-documentation ownership.
- Integration happens after both workstreams verify independently. Rebase the prediction branch onto the latest ingestion branch, resolve only genuine shared-file changes, rerun the full suite, then open one coherent feature PR or a small stacked PR if the ingestion branch is reviewed separately.
