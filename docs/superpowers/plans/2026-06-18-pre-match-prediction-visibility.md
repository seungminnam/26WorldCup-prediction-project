# Pre-Match Prediction Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show predictions only for upcoming fixtures and show observed scores after kickoff.

**Architecture:** Put status-dependent display rules in a pure JavaScript presentation helper so Node tests can cover them without rendering React. Keep prediction calculation and visual markup in the existing match-centre component.

**Tech Stack:** JavaScript, Node test runner, React, TypeScript, Next.js

---

### Task 1: Lock Down Fixture Status Presentation

**Files:**
- Create: `apps/web/lib/fixture-presentation.js`
- Create: `test/fixture-presentation.test.js`

- [ ] **Step 1: Write failing status-contract tests**

Test that `shouldShowPreMatchPrediction` returns true only for `Upcoming`, and that `displayFixtureScore` returns numeric goals for `Live`, `FT`, and `Result pending` but `-` for `Upcoming`, `Postponed`, and missing goals.

- [ ] **Step 2: Verify RED**

Run `node --test test/fixture-presentation.test.js` and expect module-not-found or missing-export failure.

- [ ] **Step 3: Add the minimal pure helpers**

Implement exact status predicates with no time-based inference or model calculation.

- [ ] **Step 4: Verify GREEN**

Run `node --test test/fixture-presentation.test.js` and expect all focused tests to pass.

### Task 2: Connect the Match Card

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`

- [ ] **Step 1: Import the presentation helpers**

Use `shouldShowPreMatchPrediction(match.status)` to guard `predictMatch` and `displayFixtureScore(match.status, goals)` for both score cells.

- [ ] **Step 2: Remove the local score-status rule**

Delete `scoreCell` after both call sites use the pure helper.

- [ ] **Step 3: Run full verification**

Run `npm test`, `npm run typecheck --workspace apps/web`, `npm run build --workspace apps/web`, `npm run secret:scan`, and `git diff --check` sequentially where `.next` is involved.

- [ ] **Step 4: Browser-check both states**

Confirm an `FT` date has zero probability ribbons and numeric scores, then confirm an upcoming date has four probability ribbons and no framework or console errors.

