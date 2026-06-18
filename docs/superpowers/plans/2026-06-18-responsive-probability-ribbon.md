# Responsive Probability Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic Home/Draw/Away probability boxes with a polished, team-named, mathematically accurate 100% stacked ribbon that remains readable for extreme probability distributions.

**Architecture:** Add a tiny pure presentation formatter in the web package so label and width behavior can be tested without React. The fixture component renders a stable three-column legend and a text-free proportional bar, while CSS owns responsive truncation and spacing.

**Tech Stack:** Node.js ESM, Node built-in test runner, React 19, Next.js 16, TypeScript, CSS.

---

## File Structure

- Create `apps/web/lib/prediction-presentation.js` for the pure legend/segment presentation contract.
- Create `test/prediction-presentation.test.js` for standard and extreme probability distributions.
- Modify `apps/web/components/match-centre/match-centre-app.tsx` to render team-named legend cells and the stacked ribbon.
- Modify `apps/web/app/globals.css` to style the responsive ribbon and remove the old equal-width probability boxes.
- Modify `docs/handoffs/2026-06-18-claude-codex-handoff.md` after verification.

### Task 1: Add A Tested Probability Presentation Contract

**Files:**
- Create: `test/prediction-presentation.test.js`
- Create: `apps/web/lib/prediction-presentation.js`

- [ ] **Step 1: Write the failing presentation tests**

Create `test/prediction-presentation.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildOutcomePresentation } from "../apps/web/lib/prediction-presentation.js";

test("buildOutcomePresentation uses team names and preserves the probability widths", () => {
  const result = buildOutcomePresentation({
    homeName: "Portugal",
    awayName: "Congo DR",
    probabilities: { homeWin: 0.68, draw: 0.21, awayWin: 0.11 }
  });

  assert.deepEqual(result, [
    { key: "home", label: "Portugal", percentLabel: "68%", width: "68%" },
    { key: "draw", label: "Draw", percentLabel: "21%", width: "21%" },
    { key: "away", label: "Congo DR", percentLabel: "11%", width: "11%" }
  ]);
});

test("buildOutcomePresentation keeps an extreme one-percent segment mathematically honest", () => {
  const result = buildOutcomePresentation({
    homeName: "Portugal",
    awayName: "Congo DR",
    probabilities: { homeWin: 0.91, draw: 0.08, awayWin: 0.01 }
  });

  assert.equal(result[2].label, "Congo DR");
  assert.equal(result[2].percentLabel, "1%");
  assert.equal(result[2].width, "1%");
  assert.equal(result.reduce((sum, outcome) => sum + Number.parseFloat(outcome.width), 0), 100);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
node --test test/prediction-presentation.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `prediction-presentation.js`.

- [ ] **Step 3: Implement the formatter**

Create `apps/web/lib/prediction-presentation.js`:

```js
export function buildOutcomePresentation({ homeName, awayName, probabilities }) {
  return [
    buildOutcome("home", homeName, probabilities.homeWin),
    buildOutcome("draw", "Draw", probabilities.draw),
    buildOutcome("away", awayName, probabilities.awayWin)
  ];
}

function buildOutcome(key, label, probability) {
  const percentage = probability * 100;
  return {
    key,
    label,
    percentLabel: `${Math.round(percentage)}%`,
    width: `${percentage}%`
  };
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test test/prediction-presentation.test.js
npm test
```

Expected: focused tests pass and the complete suite reports no failures.

- [ ] **Step 5: Commit the formatter**

```bash
git add apps/web/lib/prediction-presentation.js test/prediction-presentation.test.js
git commit -m "feat: add probability ribbon presentation model"
```

### Task 2: Render The Responsive Data Ribbon

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Replace generic probability cells with the legend and ribbon**

Import the formatter:

```tsx
import { buildOutcomePresentation } from "@/lib/prediction-presentation";
```

Inside `FixtureCard`, after creating `prediction`, derive:

```tsx
const outcomes = prediction
  ? buildOutcomePresentation({
      homeName: homeTeam.name,
      awayName: awayTeam.name,
      probabilities: prediction.probabilities
    })
  : [];
```

Replace the current `outcome-probabilities` block with:

```tsx
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
```

Delete the now-unused `ProbabilityCell` component.

- [ ] **Step 2: Replace the old probability-box CSS**

Remove `.outcome-probabilities` from the shared flex selector and delete its equal-width box rule. Add:

```css
.probability-legend {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(72px, 0.55fr) minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.probability-legend-item { min-width: 0; }
.probability-legend-item.draw { text-align: center; }
.probability-legend-item.away { text-align: right; }

.probability-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
}

.probability-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.probability-legend-item.draw .probability-name { justify-content: center; }
.probability-legend-item.away .probability-name { justify-content: flex-end; }
.probability-legend-item strong { display: block; margin-top: 2px; color: var(--ink); font-size: 1.35rem; line-height: 1; }

.probability-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; }
.probability-ribbon { display: flex; width: 100%; height: 18px; overflow: hidden; border-radius: 999px; background: #edf2f1; box-shadow: inset 0 1px 3px rgba(16, 44, 49, 0.16); }
.probability-segment { min-width: 0; }
.probability-dot.home, .probability-segment.home { background: linear-gradient(90deg, #147a65, #37b394); }
.probability-dot.draw, .probability-segment.draw { background: linear-gradient(90deg, #a48d50, #c9ae66); }
.probability-dot.away, .probability-segment.away { background: linear-gradient(90deg, #355d71, #608a9d); }
```

At the existing mobile breakpoint add:

```css
.probability-legend {
  grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr);
  gap: 6px;
}
.probability-name { font-size: 0.66rem; }
.probability-legend-item strong { font-size: 1.12rem; }
```

- [ ] **Step 3: Run static verification**

Run:

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 4: Verify browser behavior**

At `http://127.0.0.1:3000/#fixtures`, verify:

- Portugal, Draw, and Congo DR replace Home/Draw/Away.
- There is one proportional ribbon and no duplicate caption row.
- Segment inline widths match the model probabilities.
- The browser has no console errors or Next.js error overlay.
- At 390x844, all three legend values remain readable and the body has no horizontal overflow.
- With a temporary `91/8/1` browser-side fixture preview or focused formatter test, the away segment remains `1%` without a visual minimum width.

- [ ] **Step 5: Commit the UI refinement**

```bash
git add apps/web/components/match-centre/match-centre-app.tsx apps/web/app/globals.css
git commit -m "feat: refine fixture probability ribbon"
```

### Task 3: Record Verification And Preserve The Handoff

**Files:**
- Modify: `docs/handoffs/2026-06-18-claude-codex-handoff.md`

- [ ] **Step 1: Run complete verification**

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

- [ ] **Step 2: Append the ribbon verification record**

Record the feature branch, formatter and UI commit hashes, root/worker test counts, desktop/mobile browser results, extreme-distribution result, and `Remote API or Supabase writes: none` under the existing prediction workstream section.

- [ ] **Step 3: Commit the handoff update**

```bash
git add docs/handoffs/2026-06-18-claude-codex-handoff.md
git commit -m "docs: record probability ribbon verification"
```

