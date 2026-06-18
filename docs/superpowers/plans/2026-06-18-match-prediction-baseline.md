# Match Prediction Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an honest rating/Poisson match forecast that exposes W/D/L and likely-score probabilities in the fixture UI without conflicting with the ESPN ingestion workstream.

**Architecture:** Add one pure `predictMatch` API to the existing tournament engine and keep the current simulator behavior unchanged. The web app consumes the provider-neutral result contract, renders it only for upcoming fixtures, and surfaces whether tournament data came from Supabase or the static seed fallback.

**Tech Stack:** Node.js ESM, Node built-in test runner, TypeScript, React 19, Next.js 16, CSS.

---

## File Structure

- Create `test/predictor.test.js` for focused outcome-probability tests.
- Modify `packages/tournament-engine/src/engine/predictor.js` to add the pure model contract and analytical Poisson score grid.
- Modify `apps/web/components/match-centre/match-centre-app.tsx` to render source state and fixture predictions.
- Modify `apps/web/app/globals.css` for compact prediction and source-badge styling.
- Modify `docs/handoffs/2026-06-18-claude-codex-handoff.md` only after verification, recording branch, commit, files, results, and integration instructions.

### Task 1: Add The Match Prediction Contract

**Files:**
- Create: `test/predictor.test.js`
- Modify: `packages/tournament-engine/src/engine/predictor.js`

- [ ] **Step 1: Write the failing prediction tests**

Create `test/predictor.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { predictMatch } from "../packages/tournament-engine/src/engine/predictor.js";

const evenHome = { id: "home", name: "Home", rating: 1700 };
const evenAway = { id: "away", name: "Away", rating: 1700 };

test("predictMatch returns a normalized provider-neutral contract", () => {
  const result = predictMatch(evenHome, evenAway);
  const total = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;

  assert.equal(result.model.id, "rating-poisson-v1");
  assert.equal(result.model.trained, false);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(result.scorelines.length === 3);
  assert.deepEqual(result.mostLikelyScore, result.scorelines[0]);
});

test("equal ratings produce symmetric home and away win probabilities", () => {
  const result = predictMatch(evenHome, evenAway);
  assert.ok(Math.abs(result.probabilities.homeWin - result.probabilities.awayWin) < 1e-12);
  assert.ok(result.probabilities.draw > 0);
});

test("a stronger team receives the higher win probability", () => {
  const result = predictMatch(
    { id: "strong", name: "Strong", rating: 1950 },
    { id: "weak", name: "Weak", rating: 1450 }
  );
  assert.ok(result.probabilities.homeWin > result.probabilities.awayWin);
  assert.ok(result.mostLikelyScore.homeGoals >= result.mostLikelyScore.awayGoals);
});

test("scorelines are finite, non-negative, and sorted by probability", () => {
  const result = predictMatch(evenHome, evenAway);
  for (const scoreline of result.scorelines) {
    assert.ok(Number.isInteger(scoreline.homeGoals) && scoreline.homeGoals >= 0);
    assert.ok(Number.isInteger(scoreline.awayGoals) && scoreline.awayGoals >= 0);
    assert.ok(Number.isFinite(scoreline.probability) && scoreline.probability >= 0);
  }
  assert.ok(result.scorelines[0].probability >= result.scorelines[1].probability);
  assert.ok(result.scorelines[1].probability >= result.scorelines[2].probability);
});

test("predictMatch rejects missing or invalid ratings", () => {
  assert.throws(() => predictMatch({ rating: Number.NaN }, evenAway), /finite team ratings/);
  assert.throws(() => predictMatch(undefined, evenAway), /finite team ratings/);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
node --test test/predictor.test.js
```

Expected: FAIL because `predictMatch` is not exported.

- [ ] **Step 3: Implement the minimal analytical model**

Add to `packages/tournament-engine/src/engine/predictor.js`:

```js
const PREDICTION_MODEL = Object.freeze({
  id: "rating-poisson-v1",
  label: "Rating + Poisson baseline",
  trained: false
});

export function predictMatch(homeTeam, awayTeam, { maxGoals = 10, scorelineCount = 3 } = {}) {
  if (!Number.isFinite(homeTeam?.rating) || !Number.isFinite(awayTeam?.rating)) {
    throw new TypeError("predictMatch requires finite team ratings");
  }

  const homeLambda = expectedGoals(homeTeam, awayTeam);
  const awayLambda = expectedGoals(awayTeam, homeTeam);
  const rawScorelines = [];
  let capturedMass = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = poissonProbability(homeGoals, homeLambda) * poissonProbability(awayGoals, awayLambda);
      capturedMass += probability;
      rawScorelines.push({ homeGoals, awayGoals, probability });
    }
  }

  const normalized = rawScorelines
    .map((scoreline) => ({ ...scoreline, probability: scoreline.probability / capturedMass }))
    .sort((left, right) => right.probability - left.probability || left.homeGoals - right.homeGoals || left.awayGoals - right.awayGoals);

  const probabilities = normalized.reduce(
    (result, scoreline) => {
      if (scoreline.homeGoals > scoreline.awayGoals) result.homeWin += scoreline.probability;
      else if (scoreline.homeGoals < scoreline.awayGoals) result.awayWin += scoreline.probability;
      else result.draw += scoreline.probability;
      return result;
    },
    { homeWin: 0, draw: 0, awayWin: 0 }
  );

  const scorelines = normalized.slice(0, scorelineCount);
  return { model: PREDICTION_MODEL, probabilities, mostLikelyScore: scorelines[0], scorelines };
}

function poissonProbability(goals, lambda) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}
```

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
node --test test/predictor.test.js
npm test
```

Expected: focused tests pass; the full suite reports no failures.

- [ ] **Step 5: Commit the engine change**

```bash
git add packages/tournament-engine/src/engine/predictor.js test/predictor.test.js
git commit -m "feat: add match outcome probability baseline"
```

### Task 2: Show Predictions And Data Provenance In The Match Centre

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add the engine import and pass the source state**

Import `predictMatch` from `@wc/tournament-engine`. In `MatchCentreApp`, derive:

```tsx
const dataSource = initialData?.source ?? "seed";
```

Add this badge to the fixture section heading:

```tsx
<span className={`data-source ${dataSource}`}>
  {dataSource === "supabase" ? "Live database" : "Demo seed data"}
</span>
```

- [ ] **Step 2: Add the guarded fixture prediction component**

Inside `FixtureCard`, resolve both teams and only predict upcoming matches with finite ratings:

```tsx
const homeTeam = teamsById[match.homeTeamId];
const awayTeam = teamsById[match.awayTeamId];
const prediction =
  match.status === "Upcoming" && Number.isFinite(homeTeam?.rating) && Number.isFinite(awayTeam?.rating)
    ? predictMatch(homeTeam, awayTeam)
    : undefined;
```

Render after the scorers block:

```tsx
{prediction && (
  <div className="fixture-prediction">
    <div className="prediction-heading">
      <span>Rating + Poisson baseline</span>
      <strong>
        Likely {prediction.mostLikelyScore.homeGoals}-{prediction.mostLikelyScore.awayGoals}
      </strong>
    </div>
    <div className="outcome-probabilities" aria-label="Match outcome probabilities">
      <ProbabilityCell label="Home" value={prediction.probabilities.homeWin} />
      <ProbabilityCell label="Draw" value={prediction.probabilities.draw} />
      <ProbabilityCell label="Away" value={prediction.probabilities.awayWin} />
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
```

Add the helper:

```tsx
function ProbabilityCell({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <strong>{Math.round(value * 100)}%</strong>
    </span>
  );
}
```

- [ ] **Step 3: Style the compact prediction panel**

Update `.fixture-card` to allow the prediction block to span the card and add:

```css
.data-source {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 0.72rem;
  font-weight: 900;
}

.data-source.supabase { background: #e9fbf7; color: var(--accent); }
.data-source.seed { background: #fff5e8; color: #8a5314; }

.fixture-prediction {
  grid-column: 2 / -1;
  display: grid;
  gap: 7px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.prediction-heading,
.outcome-probabilities,
.likely-scorelines {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.prediction-heading span,
.fixture-prediction small { color: var(--muted); }
.outcome-probabilities span { flex: 1; border-radius: 8px; background: #f4f7f7; padding: 7px; text-align: center; }
.likely-scorelines { justify-content: flex-start; color: var(--muted); font-size: 0.76rem; font-weight: 800; }
.likely-scorelines span { border: 1px solid var(--line); border-radius: 999px; padding: 4px 7px; }
```

In the existing mobile media query, add:

```css
.fixture-prediction { grid-column: 1; }
```

- [ ] **Step 4: Run static verification**

Run:

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit the UI change**

```bash
git add apps/web/components/match-centre/match-centre-app.tsx apps/web/app/globals.css
git commit -m "feat: show fixture prediction probabilities"
```

### Task 3: Verify The Feature And Record The Handoff

**Files:**
- Modify: `docs/handoffs/2026-06-18-claude-codex-handoff.md`

- [ ] **Step 1: Run complete offline verification**

Run each command independently:

```bash
npm test
npm run ingestion:test
npm run ingestion:dry-run
npm run check
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Start the web app and verify it in a browser**

Run:

```bash
npm run dev --workspace apps/web
```

Verify the fixtures view at `http://127.0.0.1:3000/#fixtures`:

- the page loads without console errors
- the source badge says `Demo seed data` without web Supabase environment variables
- an upcoming fixture shows Home/Draw/Away percentages
- percentages total 100% after rounding tolerance
- the top three likely scores and non-ML disclosure are visible
- a completed fixture does not show a prediction block
- the layout remains usable at desktop and narrow viewport widths

Stop the dev server after verification.

- [ ] **Step 3: Update the handoff record**

Append a `Prediction Baseline Workstream` section. Record branch `feat/match-prediction-baseline`, base `d66ecd9`, the two hashes printed by `git log --oneline d66ecd9..HEAD`, the changed file groups, exact verification counts, browser result, `Remote writes: none`, and the integration instruction to rebase onto the latest ingestion branch and rerun all checks.

- [ ] **Step 4: Commit the verified handoff**

```bash
git add docs/handoffs/2026-06-18-claude-codex-handoff.md
git commit -m "docs: record match prediction verification"
```
