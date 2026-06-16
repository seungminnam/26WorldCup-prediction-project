# World Cup Tournament Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-light MVP that simulates the 2026 World Cup tournament format and displays probabilities in a browser.

**Architecture:** Core simulation logic is pure JavaScript under `src/engine`; tournament seed data is under `src/data`; browser UI imports the engine through ES modules from `public/app.js`. Tests use Node's built-in `node:test`.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, static HTML/CSS.

---

## File Structure

- `src/data/teams.js`: 48-team synthetic tournament seed data.
- `src/data/fixtures.js`: generated group-stage fixture data with optional locked results.
- `src/engine/ranking.js`: group table and ranking helpers.
- `src/engine/thirdPlace.js`: best third-place selection.
- `src/engine/predictor.js`: rating-based match and score sampler.
- `src/engine/bracket.js`: round of 32 and knockout progression.
- `src/engine/simulator.js`: full tournament and Monte Carlo orchestration.
- `public/index.html`: simulator shell.
- `public/styles.css`: app styling.
- `public/app.js`: browser interaction layer.
- `server.mjs`: tiny local static server.
- `test/engine.test.js`: core behavior tests.

## Tasks

- [ ] Add package metadata, docs, and test harness.
- [ ] Write failing engine tests for group ranking, third-place selection, knockout progression, and Monte Carlo aggregation.
- [ ] Implement seed data and core engine modules until tests pass.
- [ ] Implement browser UI around the engine.
- [ ] Run tests and start the dev server for manual verification.

## Self-Review

- Spec coverage: the plan covers the static app, core engine, probability aggregation, team drill-down, and manual locked-result boundary.
- Placeholder scan: no unresolved placeholders are present.
- Type consistency: all module names and responsibilities match the proposed file structure.
