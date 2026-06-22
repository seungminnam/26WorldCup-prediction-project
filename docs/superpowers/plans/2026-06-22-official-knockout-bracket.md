# Official Knockout Bracket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every projected knockout match follow the official FIFA World Cup 2026 bracket and display its canonical match metadata.

**Architecture:** Keep the canonical schedule as the match graph and add FIFA Annex C as the conditional third-place assignment table. Resolve and simulate the graph in the tournament engine, then render the returned metadata directly in the web app.

**Tech Stack:** JavaScript ES modules, Node test runner, TypeScript, React, Next.js

---

### Task 1: Lock the official format into tests

**Files:**
- Create: `packages/tournament-engine/test/bracket.test.js`

- [x] Add a failing test that expects M75 to resolve F1 v C2 with Monterrey metadata.
- [x] Add failing tests for the complete M73-M88 slot list and M89-M104 dependency graph.
- [x] Add a failing test that validates all 495 Annex C combinations.
- [x] Run `node --test packages/tournament-engine/test/bracket.test.js` and confirm failures are caused by the current bracket implementation.

### Task 2: Add the official third-place assignment table

**Files:**
- Create: `packages/tournament-engine/src/data/third-place-assignments.js`
- Modify: `packages/tournament-engine/src/data/index.js`

- [x] Mechanically extract the 495 rows from the official FIFA regulations PDF.
- [x] Store each row under its sorted eight-group key with assignments in FIFA column order `1A,1B,1D,1E,1G,1I,1K,1L`.
- [x] Run the Annex C tests and confirm all keys and assignments pass.

### Task 3: Replace the knockout engine with the official graph

**Files:**
- Modify: `packages/tournament-engine/src/engine/bracket.js`
- Modify: `packages/tournament-engine/src/engine/simulator.js`

- [x] Resolve fixed group positions and Annex C third-place positions against M73-M88 from `knockoutFixtures`.
- [x] Simulate later rounds by resolving canonical `Wxx` and `Lxx` references.
- [x] Return numeric match IDs and canonical city, stadium, kickoff, stage, and slots for every match.
- [x] Run the bracket tests and the full Node test suite.

### Task 4: Render canonical match metadata

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`

- [x] Extend the local knockout match type with canonical metadata.
- [x] Remove the hard-coded venue rotation.
- [x] Render the stadium/city and `Mxx` number returned by the engine.
- [x] Run `npm run typecheck --workspace apps/web`.

### Task 5: Verify the complete experience

**Files:**
- No additional files expected.

- [x] Run `npm test`.
- [x] Run `npm run typecheck --workspace apps/web`.
- [x] Run `npm run web:build`.
- [x] Start the local site and verify projected standings feed the correct teams into all 32 bracket matches.
- [x] Specifically verify M75 displays projected F1 v C2 at Monterrey and downstream winners follow the official graph.
