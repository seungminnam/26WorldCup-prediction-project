# Canonical Fixture Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthetic fixture metadata with the official 104-match FIFA schedule and enforce a result-only ESPN write boundary.

**Architecture:** A canonical schedule module owns immutable tournament metadata. The simulation receives its 72 group fixtures, while the UI and database receive all 104. ESPN normalization retains metadata for comparison, but the writer applies only result and event fields.

**Tech Stack:** Node.js ESM, Node test runner, Next.js, Supabase/Postgres, ESPN scoreboard JSON.

**Status:** Implemented and verified against ESPN and the linked Supabase project on 22 June 2026.

---

### Task 1: Canonical schedule contract

**Files:**
- Create: `packages/tournament-engine/test/canonical-schedule.test.js`
- Create: `packages/tournament-engine/src/data/canonical-schedule.js`
- Modify: `packages/tournament-engine/src/data/fixtures.js`
- Modify: `packages/tournament-engine/src/data/index.js`

- [ ] Write failing tests for 104 unique match numbers, 72 fixed group fixtures, 32 knockout slot fixtures, and known matches 25 and 28.
- [ ] Run the focused test and confirm it fails because the canonical schedule export is missing.
- [ ] Add the FIFA schedule snapshot and derive the group-only engine fixture export from it.
- [ ] Run the focused test and full engine suite.

### Task 2: Result-only ESPN boundary

**Files:**
- Create: `apps/ingestion-worker/src/provider/espn.js`
- Create: `apps/ingestion-worker/test/espn.test.js`
- Modify: `apps/ingestion-worker/src/sync/live-score.js`
- Modify: `apps/ingestion-worker/test/live-score.test.js`

- [ ] Write failing tests that normalize ESPN results and detect kickoff, venue, and participant drift.
- [ ] Assert that the upsert plan never contains fixed metadata columns.
- [ ] Implement ESPN normalization and canonical drift comparison.
- [ ] Run ingestion tests.

### Task 3: Full schedule data layer and UI

**Files:**
- Modify: `apps/web/lib/tournament-data.ts`
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] Add failing data-layer tests for preserving knockout rows with null team IDs and slot labels.
- [ ] Map all fixture stages and slot labels from Supabase.
- [ ] Render placeholder slots for unknown knockout participants while keeping KST date grouping.
- [ ] Build the web application.

### Task 4: Seed and migration

**Files:**
- Modify: `scripts/generate-supabase-seed.mjs`
- Modify: `supabase/schema.sql`
- Generate: `supabase/seed.sql`
- Create through Supabase CLI: `supabase/migrations/*_canonicalize_world_cup_schedule.sql`

- [ ] Update seed generation to emit all 104 fixtures and knockout slots.
- [ ] Use `supabase migration new canonicalize_world_cup_schedule` to create the migration file.
- [ ] Add slot columns, update `fixture_cards`, upsert fixed schedule fields, and preserve result-owned fields.
- [ ] Regenerate the seed and verify its 104 fixture rows.

### Task 5: Apply and audit

**Files:**
- Create: `scripts/audit-fixture-integrity.mjs`
- Modify: `package.json`

- [ ] Add a failing audit test or fixture proving drift is reported.
- [ ] Implement an audit command comparing canonical, ESPN, and Supabase fixed fields.
- [ ] Apply the migration to the linked Supabase project.
- [ ] Verify 104 database fixtures and preserve the pre-migration baseline of 40 final results and 123 ESPN scoring events.
- [ ] Run `npm test`, ingestion tests, the integrity audit, secret scan, and production build.
