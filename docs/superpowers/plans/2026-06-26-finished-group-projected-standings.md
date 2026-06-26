# Collapsed Cards For Finished Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a group's 6 matches are all complete, collapse its "Projected Group Tables" card into a one-line "Finished" badge (expandable on click) instead of showing a full table that's now byte-for-byte identical to the real Standings table next to it.

**Architecture:** A new pure helper (`computeCompletedGroups`) determines which groups are fully complete from the fixture list. The Standings tab's render branches per group: complete groups render a new collapsible `FinishedGroupCard`; incomplete groups render the existing `ProjectedStandingTable` unchanged. Expansion state is local `useState`, not persisted.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Node's built-in test runner (`node --test`).

## Global Constraints

- A group counts as "finished" only when ALL of its group-stage fixtures have `status === "FT"` with finite `homeGoals`/`awayGoals` — the same predicate `completedFixtures` already applies to a single fixture.
- Finished groups default to collapsed; clicking expands them in place to the same `ProjectedStandingTable` shown today. Expansion state resets on reload (no persistence).
- The "Current tables" panel (`currentStandings`) and the Forecast tab's per-team "Sample finish" drill-down are unaffected — out of scope.
- No automated component-rendering tests are introduced — this codebase has none for `match-centre-app.tsx` today (only plain-logic `.test.js` files exist under `apps/web/test/`). New logic must be extracted into a plain, exported, unit-testable function instead.

---

## File Structure

- Modify `apps/web/lib/fixture-presentation.js` — add `computeCompletedGroups(fixtures)`.
- Create `apps/web/test/fixture-presentation.test.js` — unit tests for the new helper.
- Modify `apps/web/components/match-centre/match-centre-app.tsx` — import the helper, add `expandedFinishedGroups` state, branch the Projected Group Tables render, add the new `FinishedGroupCard` component.
- Modify `apps/web/app/globals.css` — add styles for the collapsed/expanded card.

---

### Task 1: `computeCompletedGroups` Helper

**Files:**
- Modify: `apps/web/lib/fixture-presentation.js`
- Create: `apps/web/test/fixture-presentation.test.js`

**Interfaces:**
- Produces: `computeCompletedGroups(fixtures: Array<{ group: string | null, status: string, homeGoals?: number, awayGoals?: number }>): Set<string>` — a group's label is in the returned set iff that group has at least one fixture AND every fixture with that group label has `status === "FT"` and finite `homeGoals`/`awayGoals`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/fixture-presentation.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { computeCompletedGroups } from "../lib/fixture-presentation.js";

test("a group with every fixture FT and scored is complete", () => {
  const fixtures = [
    { group: "A", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "A", status: "FT", homeGoals: 1, awayGoals: 1 },
    { group: "A", status: "FT", homeGoals: 0, awayGoals: 3 }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(completed.has("A"));
});

test("a group with one unfinished fixture is not complete", () => {
  const fixtures = [
    { group: "B", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "B", status: "Upcoming", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("B"));
});

test("a group with zero fixtures played is not complete", () => {
  const fixtures = [
    { group: "C", status: "Upcoming", homeGoals: undefined, awayGoals: undefined },
    { group: "C", status: "Upcoming", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("C"));
});

test("non-group (knockout) fixtures with a null group are ignored", () => {
  const fixtures = [
    { group: "D", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: null, status: "FT", homeGoals: 1, awayGoals: 0 }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(completed.has("D"));
  assert.equal(completed.size, 1);
});

test("a fixture marked FT but missing a score does not count as complete", () => {
  const fixtures = [
    { group: "E", status: "FT", homeGoals: 2, awayGoals: 0 },
    { group: "E", status: "FT", homeGoals: undefined, awayGoals: undefined }
  ];

  const completed = computeCompletedGroups(fixtures);

  assert.ok(!completed.has("E"));
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test apps/web/test/fixture-presentation.test.js
```
Expected: FAIL — `computeCompletedGroups` is not exported yet.

- [ ] **Step 3: Implement the helper**

In `apps/web/lib/fixture-presentation.js`, add this export (the file currently has no other content besides `scoreBearingStatuses`, `shouldShowPreMatchPrediction`, and `displayFixtureScore` — leave those exactly as they are and add this at the end):

```js
export function computeCompletedGroups(fixtures) {
  const totalByGroup = new Map();
  const completedByGroup = new Map();

  for (const fixture of fixtures) {
    if (!fixture.group) continue;
    totalByGroup.set(fixture.group, (totalByGroup.get(fixture.group) ?? 0) + 1);
    const isComplete =
      fixture.status === "FT" && Number.isFinite(fixture.homeGoals) && Number.isFinite(fixture.awayGoals);
    if (isComplete) {
      completedByGroup.set(fixture.group, (completedByGroup.get(fixture.group) ?? 0) + 1);
    }
  }

  const completedGroups = new Set();
  for (const [group, total] of totalByGroup) {
    if (total > 0 && completedByGroup.get(group) === total) {
      completedGroups.add(group);
    }
  }
  return completedGroups;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test apps/web/test/fixture-presentation.test.js
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/fixture-presentation.js apps/web/test/fixture-presentation.test.js
git commit -m "feat: add computeCompletedGroups helper for finished-group detection"
```

---

### Task 2: `FinishedGroupCard` Component And Render Branching

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `computeCompletedGroups` (Task 1), existing `GroupProjectionRow` type, existing `AppTeam`/`AppFixture` types, existing `teamFlag`/`teamName` helpers, existing `ProjectedStandingTable` component — all already defined in `match-centre-app.tsx`.
- Produces: nothing consumed by a later task — this is the final task.

- [ ] **Step 1: Import the new helper**

In `apps/web/components/match-centre/match-centre-app.tsx`, find this existing import line:

```ts
import { displayFixtureScore, shouldShowPreMatchPrediction } from "@/lib/fixture-presentation";
```

Replace it with:

```ts
import { computeCompletedGroups, displayFixtureScore, shouldShowPreMatchPrediction } from "@/lib/fixture-presentation";
```

- [ ] **Step 2: Add `completedGroupSet` and `expandedFinishedGroups` state**

Find this existing block (around line 290):

```ts
  const currentStandings = useMemo(
    () => buildStandings(completedFixtures(fixtures), teams),
    [fixtures, teams]
  );
  const projectedStandings = useMemo(
    () => groupProjectedStandings(forecast?.groupProjections ?? []),
    [forecast]
  );
```

Replace it with:

```ts
  const currentStandings = useMemo(
    () => buildStandings(completedFixtures(fixtures), teams),
    [fixtures, teams]
  );
  const completedGroupSet = useMemo(() => computeCompletedGroups(fixtures), [fixtures]);
  const [expandedFinishedGroups, setExpandedFinishedGroups] = useState<Set<string>>(new Set());
  const projectedStandings = useMemo(
    () => groupProjectedStandings(forecast?.groupProjections ?? []),
    [forecast]
  );
```

- [ ] **Step 3: Add the toggle function**

Find the existing `runForecast` function (around line 337):

```ts
  function runForecast() {
```

Add this new function directly above it:

```ts
  function toggleFinishedGroup(group: string) {
    setExpandedFinishedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  function runForecast() {
```

- [ ] **Step 4: Branch the Projected Group Tables render**

Find this exact block in the Standings tab section (around line 502-506):

```tsx
                <div className="standings-grid">
                  {projectedStandings.map((rows) => (
                    <ProjectedStandingTable key={rows[0].group} rows={rows} teamsById={teamsById} />
                  ))}
                </div>
```

Replace it with:

```tsx
                <div className="standings-grid">
                  {projectedStandings.map((rows) =>
                    completedGroupSet.has(rows[0].group) ? (
                      <FinishedGroupCard
                        key={rows[0].group}
                        rows={rows}
                        teamsById={teamsById}
                        expanded={expandedFinishedGroups.has(rows[0].group)}
                        onToggle={() => toggleFinishedGroup(rows[0].group)}
                      />
                    ) : (
                      <ProjectedStandingTable key={rows[0].group} rows={rows} teamsById={teamsById} />
                    )
                  )}
                </div>
```

- [ ] **Step 5: Add the `FinishedGroupCard` component**

Find the existing `ProjectedStandingTable` component (around line 917-959) and add this new component directly after its closing brace:

```tsx
function FinishedGroupCard({
  rows,
  teamsById,
  expanded,
  onToggle
}: {
  rows: GroupProjectionRow[];
  teamsById: Record<string, AppTeam>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="standing-card projected finished-group-card">
      <button type="button" className="finished-collapsed" onClick={onToggle} aria-expanded={expanded}>
        <span>
          Group {rows[0].group} · Finished — see Standings for the final table
        </span>
        <span className={`finished-collapsed-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {expanded && <ProjectedStandingTable rows={rows} teamsById={teamsById} />}
    </article>
  );
}
```

- [ ] **Step 6: Add CSS for the collapsed card**

In `apps/web/app/globals.css`, find this existing block:

```css
.standing-card.projected h3 {
  background: #eef8f6;
}
```

Add this directly after it:

```css
.finished-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: #eef8f6;
  color: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.finished-collapsed:hover {
  background: #e3f3f0;
}

.finished-collapsed-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.finished-collapsed-chevron.expanded {
  transform: rotate(180deg);
}

.finished-group-card .projected-table {
  margin-top: 0;
}
```

- [ ] **Step 7: Run the test suite, typecheck, and build**

```bash
npm test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```
Expected: all pass (the new `fixture-presentation.test.js` tests run as part of `npm test`'s top-level `node --test`, since that's how the existing `apps/web/test/*.test.js` files are already picked up).

- [ ] **Step 8: Manual verification**

```bash
npm run dev --workspace apps/web
```
Using the `/browse` skill or a regular browser: open the Standings tab.
- If no group is currently fully complete in the active data source, this step can only confirm the unfinished-group rendering is unchanged (every group still shows its full projected table, no collapsed cards, no console errors) — note this in your report rather than skipping verification entirely.
- If at least one group is complete, confirm: that group renders as a collapsed one-line card by default; clicking it expands to show the same table `ProjectedStandingTable` would have rendered; clicking again collapses it back; other groups are unaffected.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/match-centre/match-centre-app.tsx apps/web/app/globals.css
git commit -m "feat: collapse finished groups in Projected Group Tables into expandable cards"
```

---

### Task 3: Final Verification

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

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/finished-group-projected-cards
gh pr create --base main --head feat/finished-group-projected-cards --title "feat: collapse finished groups in Projected Group Tables" --body "See docs/superpowers/specs/2026-06-26-finished-group-projected-standings-design.md for the design."
```

- [ ] **Step 3: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.
