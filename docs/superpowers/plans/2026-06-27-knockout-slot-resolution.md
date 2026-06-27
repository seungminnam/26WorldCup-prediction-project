# Real Knockout Slot Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve real team IDs for knockout-stage fixtures (Round of 32 through Final) from real, persisted group-stage results, instead of leaving them as permanent placeholder slot labels.

**Architecture:** The resolution algorithm lives in `packages/tournament-engine` as a new function reusing the existing group-ranking and third-place-selection logic. A new `apps/ingestion-worker` sync module reads real Supabase data, calls the engine function, and writes only the newly-resolved matches back — manually triggered via a CLI script, mirroring the project's existing `sync-espn-results`/`sync-espn-live` patterns exactly.

**Tech Stack:** Node.js ESM, Node built-in test runner, Supabase (PostgREST via `@supabase/supabase-js`), PostgreSQL migrations.

## Global Constraints

- A group's 1st/2nd-place slots resolve as soon as that specific group's matches are all finished — independent of other groups.
- Third-place slots (and therefore the rest of Round of 32) only resolve once ALL 12 groups are finished.
- Round of 16 through Final resolve via `W##`/`L##` cascade using each referenced match's real `winnerTeamId`, in a single forward pass ordered by match number (so later rounds resolve in the same pass once their sources do).
- The resolution function never re-touches a match that already has real `homeTeamId`/`awayTeamId` — calling it repeatedly with updated data is always safe.
- Manual CLI trigger only — no automated cron, consistent with this project's existing preference for manual triggers over automated scheduling for this class of operation.
- The migration fix must not change the meaning of a fresh seed (still seeds missing rows correctly) while protecting already-resolved `home_team_id`/`away_team_id`/`home_slot`/`away_slot` from being clobbered on re-run.

---

## File Structure

- Modify `packages/tournament-engine/src/engine/bracket.js` — new exported `resolveRealKnockoutSlots`.
- Create `packages/tournament-engine/test/resolve-real-knockout-slots.test.js`.
- Modify `supabase/migrations/20260618154700_canonicalize_world_cup_schedule.sql` — safer upsert clause.
- Modify `apps/ingestion-worker/src/storage/supabase-writer.js` — new `loadAllFixturesAndTeams`, `applyResolveKnockoutSlotsPlan`.
- Modify `apps/ingestion-worker/test/supabase-writer.test.js` — tests for the two new writer functions.
- Create `apps/ingestion-worker/src/sync/resolve-knockout-slots.js` — `buildResolveKnockoutSlotsPlan`, `resolveKnockoutSlots`.
- Create `apps/ingestion-worker/test/resolve-knockout-slots.test.js`.
- Create `apps/ingestion-worker/src/cli/resolve-knockout-slots.js`.

---

### Task 1: Engine Resolution Function

**Files:**
- Modify: `packages/tournament-engine/src/engine/bracket.js`
- Create: `packages/tournament-engine/test/resolve-real-knockout-slots.test.js`

**Interfaces:**
- Produces: `resolveRealKnockoutSlots(teamList, matches) => Map<matchNumber, { homeTeamId, awayTeamId }>`. `teamList` is `Array<{ id, group, rating, fifaRanking }>` (same shape `rankAllGroups`/`buildGroupTable` already expect). `matches` is the full real match list (group + knockout) in the engine's existing camelCase shape: group matches need `group`, `homeTeamId`, `awayTeamId`, `homeGoals`, `awayGoals`; knockout matches need `matchNumber`, `group: null` (or falsy), `homeTeamId`, `awayTeamId` (both `null`/falsy if unresolved), `winnerTeamId` (`null` if not yet played).

- [ ] **Step 1: Write the failing tests**

Create `packages/tournament-engine/test/resolve-real-knockout-slots.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { resolveRealKnockoutSlots } from "../src/engine/bracket.js";
import { knockoutFixtures } from "../src/data/canonical-schedule.js";
import { teams } from "../src/data/teams.js";
import { fixtures as groupFixtures } from "../src/data/fixtures.js";

function buildGroupMatches(groupsToComplete) {
  return groupFixtures.map((fixture) => {
    if (!groupsToComplete.has(fixture.group)) {
      return { ...fixture, homeGoals: undefined, awayGoals: undefined };
    }
    const teamsInGroup = teams.filter((team) => team.group === fixture.group).sort((a, b) => a.id.localeCompare(b.id));
    const homeIndex = teamsInGroup.findIndex((team) => team.id === fixture.homeTeamId);
    const awayIndex = teamsInGroup.findIndex((team) => team.id === fixture.awayTeamId);
    return homeIndex < awayIndex
      ? { ...fixture, homeGoals: 2, awayGoals: 0 }
      : { ...fixture, homeGoals: 0, awayGoals: 2 };
  });
}

// Merges newly-resolved team identities into a knockout-match input list, carrying forward
// anything already known from `previousInput`. Never sets winnerTeamId on its own -- a
// resolved match's TEAMS being known is independent of that match having been PLAYED yet.
function mergeResolvedTeams(resolvedByNumber, previousInput = []) {
  const previousByNumber = new Map(previousInput.map((match) => [match.matchNumber, match]));
  return knockoutFixtures.map((fixture) => {
    const resolved = resolvedByNumber.get(fixture.matchNumber);
    const previous = previousByNumber.get(fixture.matchNumber);
    if (resolved) {
      return {
        matchNumber: fixture.matchNumber,
        group: null,
        homeTeamId: resolved.homeTeamId,
        awayTeamId: resolved.awayTeamId,
        winnerTeamId: previous?.winnerTeamId ?? null
      };
    }
    return (
      previous ?? {
        matchNumber: fixture.matchNumber,
        group: null,
        homeTeamId: null,
        awayTeamId: null,
        winnerTeamId: null
      }
    );
  });
}

// Simulates "these specific already-resolved matches were played, home team won" --
// used only by tests that need a real winner for W##/L## cascade resolution.
function markHomeTeamAsWinner(knockoutInput, matchNumbers) {
  const targets = new Set(matchNumbers);
  return knockoutInput.map((match) =>
    targets.has(match.matchNumber) ? { ...match, winnerTeamId: match.homeTeamId } : match
  );
}

const groups = [...new Set(teams.map((team) => team.group))].sort();

test("resolves 1st/2nd place slots incrementally as individual groups finish, before all groups are done", () => {
  const completedGroups = new Set(groups.slice(0, 9));
  const matches = buildGroupMatches(completedGroups);

  const resolved = resolveRealKnockoutSlots(teams, matches);

  assert.equal(resolved.size, 5);
  assert.deepEqual(resolved.get(73), { homeTeamId: "KOR", awayTeamId: "CAN" });
});

test("resolves the remaining Round-of-32 slots once all 12 groups finish, without re-resolving already-resolved matches", () => {
  const completedGroups = new Set(groups.slice(0, 9));
  const matches1 = buildGroupMatches(completedGroups);
  const resolved1 = resolveRealKnockoutSlots(teams, matches1);
  const knockoutInput1 = mergeResolvedTeams(resolved1);

  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolved2 = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInput1]);

  assert.equal(resolved2.size, 11);
  assert.ok(!resolved2.has(73), "M73 was already resolved in the first pass and must not be re-emitted");
});

test("cascades W##/L## references for Round of 16 once Round-of-32 matches have real winners", () => {
  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolvedR32 = resolveRealKnockoutSlots(teams, allGroupMatches);
  const knockoutInput = markHomeTeamAsWinner(mergeResolvedTeams(resolvedR32), resolvedR32.keys());

  const resolvedR16 = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInput]);

  assert.equal(resolvedR16.size, 8);
  assert.deepEqual(resolvedR16.get(90), { homeTeamId: "KOR", awayTeamId: "JPN" });
});

test("never re-emits a knockout match that already has real team IDs", () => {
  const allGroupMatches = buildGroupMatches(new Set(groups));
  const resolvedR32 = resolveRealKnockoutSlots(teams, allGroupMatches);
  const knockoutInputAfterR32 = markHomeTeamAsWinner(mergeResolvedTeams(resolvedR32), resolvedR32.keys());

  const firstPass = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...knockoutInputAfterR32]);
  const secondPassInput = mergeResolvedTeams(firstPass, knockoutInputAfterR32);
  const secondPass = resolveRealKnockoutSlots(teams, [...allGroupMatches, ...secondPassInput]);

  for (const matchNumber of firstPass.keys()) {
    assert.ok(!secondPass.has(matchNumber), `M${matchNumber} was already resolved and must not be re-emitted`);
  }
});
```

This test deliberately uses the real `teams`/`fixtures`/`canonical-schedule` data (rather than hand-built synthetic fixtures) so the exact expected values (`resolved.size`, specific team IDs) are grounded in the project's real dataset and were verified against the actual implementation below before being written here.

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test packages/tournament-engine/test/resolve-real-knockout-slots.test.js
```
Expected: FAIL — `resolveRealKnockoutSlots` isn't exported yet.

- [ ] **Step 3: Implement the function**

In `packages/tournament-engine/src/engine/bracket.js`, change the top imports from:

```js
import { knockoutFixtures } from "../data/canonical-schedule.js";
import { thirdPlaceAssignments } from "../data/third-place-assignments.js";
import { pickKnockoutWinner, simulateScore } from "./predictor.js";
```

to:

```js
import { knockoutFixtures } from "../data/canonical-schedule.js";
import { thirdPlaceAssignments } from "../data/third-place-assignments.js";
import { pickKnockoutWinner, simulateScore } from "./predictor.js";
import { rankAllGroups } from "./ranking.js";
import { selectBestThirdPlaceTeams } from "./thirdPlace.js";
```

Then append this to the end of the file (after the existing `simulateKnockout` function's closing brace):

```js

function isGroupComplete(groupMatches) {
  return (
    groupMatches.length > 0 &&
    groupMatches.every((match) => Number.isFinite(match.homeGoals) && Number.isFinite(match.awayGoals))
  );
}

export function resolveRealKnockoutSlots(teamList, matches) {
  const groups = [...new Set(teamList.map((team) => team.group))].sort();
  const groupMatches = matches.filter((match) => match.group);
  const groupRankings = rankAllGroups(teamList, groupMatches);
  const rankingByGroup = new Map(groupRankings.map((ranking) => [ranking[0].group, ranking]));
  const knockoutByNumber = new Map(
    matches.filter((match) => !match.group).map((match) => [match.matchNumber, match])
  );

  const completedGroups = groups.filter((group) =>
    isGroupComplete(groupMatches.filter((match) => match.group === group))
  );

  const slots = new Map();
  for (const group of completedGroups) {
    const ranking = rankingByGroup.get(group);
    slots.set(`1${group}`, ranking[0].teamId);
    slots.set(`2${group}`, ranking[1].teamId);
  }

  let thirdAssignments = null;
  if (completedGroups.length === groups.length) {
    const bestThirds = selectBestThirdPlaceTeams(groupRankings);
    for (const third of bestThirds) {
      slots.set(`3${third.group}`, third.teamId);
    }
    const combination = bestThirds.map((third) => third.group).sort().join("");
    thirdAssignments = thirdPlaceAssignments[combination];
    if (!thirdAssignments) {
      throw new Error(`No FIFA Annex C assignment for third-place groups ${combination}`);
    }
  }

  const resolved = new Map();
  const resolvedTeamsByNumber = new Map();

  function recordTeams(matchNumber, homeTeamId, awayTeamId, isNew) {
    resolvedTeamsByNumber.set(matchNumber, [homeTeamId, awayTeamId]);
    if (isNew) {
      resolved.set(matchNumber, { homeTeamId, awayTeamId });
    }
  }

  for (const fixture of knockoutFixtures.slice(0, 16)) {
    const existing = knockoutByNumber.get(fixture.matchNumber);
    if (existing?.homeTeamId && existing?.awayTeamId) {
      recordTeams(fixture.matchNumber, existing.homeTeamId, existing.awayTeamId, false);
      continue;
    }

    const resolveSlot = (slot, otherSlot) =>
      slot.startsWith("3 ")
        ? thirdAssignments
          ? slots.get(thirdAssignments[otherSlot])
          : undefined
        : slots.get(slot);

    const homeTeamId = resolveSlot(fixture.homeSlot, fixture.awaySlot);
    const awayTeamId = resolveSlot(fixture.awaySlot, fixture.homeSlot);
    if (homeTeamId && awayTeamId) {
      recordTeams(fixture.matchNumber, homeTeamId, awayTeamId, true);
    }
  }

  for (const fixture of knockoutFixtures.slice(16)) {
    const existing = knockoutByNumber.get(fixture.matchNumber);
    if (existing?.homeTeamId && existing?.awayTeamId) {
      recordTeams(fixture.matchNumber, existing.homeTeamId, existing.awayTeamId, false);
      continue;
    }

    const resolveReference = (slot) => {
      const sourceNumber = Number(slot.slice(1));
      const sourceMatch = knockoutByNumber.get(sourceNumber);
      const sourceTeams = resolvedTeamsByNumber.get(sourceNumber);
      if (!sourceMatch?.winnerTeamId || !sourceTeams) {
        return undefined;
      }
      const [homeId, awayId] = sourceTeams;
      const winner = sourceMatch.winnerTeamId;
      const loser = winner === homeId ? awayId : homeId;
      return slot.startsWith("W") ? winner : loser;
    };

    const homeTeamId = resolveReference(fixture.homeSlot);
    const awayTeamId = resolveReference(fixture.awaySlot);
    if (homeTeamId && awayTeamId) {
      recordTeams(fixture.matchNumber, homeTeamId, awayTeamId, true);
    }
  }

  return resolved;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test packages/tournament-engine/test/resolve-real-knockout-slots.test.js
```
Expected: all 4 tests pass.

- [ ] **Step 5: Run the full package test suite**

```bash
npm test
```
Expected: 191 tests pass (the existing 187 plus these 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add packages/tournament-engine/src/engine/bracket.js packages/tournament-engine/test/resolve-real-knockout-slots.test.js
git commit -m "feat: resolve real knockout bracket slots from finished group results"
```

---

### Task 2: Migration Fix — Don't Clobber Resolved Slots On Re-Run

**Files:**
- Modify: `supabase/migrations/20260618154700_canonicalize_world_cup_schedule.sql`

**Interfaces:** none (SQL-only change, no code consumes this directly).

- [ ] **Step 1: Apply the fix**

In `supabase/migrations/20260618154700_canonicalize_world_cup_schedule.sql`, find this exact block (currently lines 139-149):

```sql
on conflict (id) do update set
  match_number = excluded.match_number,
  group_code = excluded.group_code,
  stage = excluded.stage,
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  home_slot = excluded.home_slot,
  away_slot = excluded.away_slot,
  kickoff_at = excluded.kickoff_at,
  venue_id = excluded.venue_id,
  venue_name = excluded.venue_name;
```

Replace it with:

```sql
on conflict (id) do update set
  match_number = excluded.match_number,
  group_code = excluded.group_code,
  stage = excluded.stage,
  home_team_id = coalesce(fixtures.home_team_id, excluded.home_team_id),
  away_team_id = coalesce(fixtures.away_team_id, excluded.away_team_id),
  home_slot = coalesce(fixtures.home_slot, excluded.home_slot),
  away_slot = coalesce(fixtures.away_slot, excluded.away_slot),
  kickoff_at = excluded.kickoff_at,
  venue_id = excluded.venue_id,
  venue_name = excluded.venue_name;
```

This means a re-run of this seed migration still fills in any row that's genuinely missing those values, but never overwrites a `home_team_id`/`away_team_id`/`home_slot`/`away_slot` that's already been resolved by this feature's new sync script — only this migration's `do update set` clause changes; nothing else in the file (the `insert into ... values (...)` rows above it are untouched).

- [ ] **Step 2: Manually verify the fix is syntactically sound**

This project does not run Supabase migrations in its automated test suite, so verify by reading: confirm the edited block is valid by checking that every other `coalesce(...)` usage pattern in this migrations directory follows the same `coalesce(target_table.column, excluded.column)` form (if any exist), and that `fixtures` (the bare table name used inside `coalesce`) matches the table named in this same statement's `insert into public.fixtures (...)` line directly above. If you have access to a local Supabase instance, you can additionally verify by running `supabase db reset` and confirming the migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260618154700_canonicalize_world_cup_schedule.sql
git commit -m "fix: don't clobber resolved knockout team IDs when the schedule seed migration re-runs"
```

---

### Task 3: Supabase Writer Additions

**Files:**
- Modify: `apps/ingestion-worker/src/storage/supabase-writer.js`
- Modify: `apps/ingestion-worker/test/supabase-writer.test.js`

**Interfaces:**
- Produces: `writer.loadAllFixturesAndTeams() => Promise<{ fixtureRows: Array<object>, teamRows: Array<object> }>` (raw snake_case Supabase rows). `writer.applyResolveKnockoutSlotsPlan({ id, homeTeamId, awayTeamId }) => Promise<{ fixtureId, homeTeamId, awayTeamId }>`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/ingestion-worker/test/supabase-writer.test.js` (this file already imports `assert`, `test`, and `createSupabaseWriter` at the top — add these as new top-level tests, anywhere after the existing ones):

```js
test("loadAllFixturesAndTeams reads the full fixture and team rows needed for knockout slot resolution", async () => {
  const fixtureRows = [
    {
      id: "M-73",
      match_number: 73,
      group_code: null,
      stage: "round_of_32",
      home_team_id: null,
      away_team_id: null,
      home_slot: "2A",
      away_slot: "2B",
      home_goals: null,
      away_goals: null,
      winner_team_id: null
    }
  ];
  const teamRows = [{ id: "MEX", group_code: "A", rating: 1715, fifa_ranking: 14 }];
  const client = {
    from(table) {
      if (table === "fixture_cards") {
        return { select: () => Promise.resolve({ data: fixtureRows, error: null }) };
      }
      if (table === "teams") {
        return { select: () => Promise.resolve({ data: teamRows, error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.loadAllFixturesAndTeams();

  assert.deepEqual(result.fixtureRows, fixtureRows);
  assert.deepEqual(result.teamRows, teamRows);
});

test("applyResolveKnockoutSlotsPlan updates a fixture's resolved team IDs", async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "fixtures");
      return {
        update(values) {
          return {
            eq(column, value) {
              calls.push({ values, column, value });
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };

  const writer = createSupabaseWriter({ client });
  const result = await writer.applyResolveKnockoutSlotsPlan({ id: "M-73", homeTeamId: "KOR", awayTeamId: "CAN" });

  assert.deepEqual(calls, [{ values: { home_team_id: "KOR", away_team_id: "CAN" }, column: "id", value: "M-73" }]);
  assert.deepEqual(result, { fixtureId: "M-73", homeTeamId: "KOR", awayTeamId: "CAN" });
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js
```
Expected: FAIL — `loadAllFixturesAndTeams`/`applyResolveKnockoutSlotsPlan` aren't defined yet.

- [ ] **Step 3: Implement the two writer functions**

In `apps/ingestion-worker/src/storage/supabase-writer.js`, find the existing `loadTeamNamesById` method:

```js
    async loadTeamNamesById() {
      const result = await client.from("teams").select("id,name");

      if (result.error) {
        throw result.error;
      }

      return new Map((result.data ?? []).map((row) => [row.id, row.name]));
    },
```

Add these two new methods directly after it (still inside the same returned object literal, before `recordIngestionRun`):

```js
    async loadAllFixturesAndTeams() {
      const fixturesResult = await client
        .from("fixture_cards")
        .select(
          "id,match_number,group_code,stage,home_team_id,away_team_id,home_slot,away_slot,home_goals,away_goals,winner_team_id"
        );

      if (fixturesResult.error) {
        throw fixturesResult.error;
      }

      const teamsResult = await client.from("teams").select("id,group_code,rating,fifa_ranking");

      if (teamsResult.error) {
        throw teamsResult.error;
      }

      return {
        fixtureRows: fixturesResult.data ?? [],
        teamRows: teamsResult.data ?? []
      };
    },

    async applyResolveKnockoutSlotsPlan(plan) {
      const result = await client
        .from("fixtures")
        .update({ home_team_id: plan.homeTeamId, away_team_id: plan.awayTeamId })
        .eq("id", plan.id);

      if (result.error) {
        throw result.error;
      }

      return { fixtureId: plan.id, homeTeamId: plan.homeTeamId, awayTeamId: plan.awayTeamId };
    },
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test apps/ingestion-worker/test/supabase-writer.test.js
```
Expected: all tests pass (existing tests plus the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/ingestion-worker/src/storage/supabase-writer.js apps/ingestion-worker/test/supabase-writer.test.js
git commit -m "feat: add Supabase reads/writes for knockout slot resolution"
```

---

### Task 4: Ingestion-Worker Sync Module

**Files:**
- Create: `apps/ingestion-worker/src/sync/resolve-knockout-slots.js`
- Create: `apps/ingestion-worker/test/resolve-knockout-slots.test.js`

**Interfaces:**
- Consumes: `resolveRealKnockoutSlots` from `@wc/tournament-engine` (Task 1). `writer.applyResolveKnockoutSlotsPlan`, `writer.recordIngestionRun` (Task 3 and existing).
- Produces: `buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows }) => Array<{ id, matchNumber, homeTeamId, awayTeamId }>`. `resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply }) => Promise<{ mode: "dry-run" | "apply", resolvedCount: number, plan: Array<object> }>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/ingestion-worker/test/resolve-knockout-slots.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { teams } from "@wc/tournament-engine/data";
import { fixtures as groupFixtures } from "@wc/tournament-engine/data";
import { knockoutFixtures } from "@wc/tournament-engine/data";
import { buildResolveKnockoutSlotsPlan, resolveKnockoutSlots } from "../src/sync/resolve-knockout-slots.js";

function buildTeamRows() {
  return teams.map((team) => ({
    id: team.id,
    group_code: team.group,
    rating: team.rating,
    fifa_ranking: team.fifaRanking
  }));
}

function buildFixtureRows() {
  const groupRows = groupFixtures.map((fixture, index) => {
    const teamsInGroup = teams.filter((team) => team.group === fixture.group).sort((a, b) => a.id.localeCompare(b.id));
    const homeIndex = teamsInGroup.findIndex((team) => team.id === fixture.homeTeamId);
    const awayIndex = teamsInGroup.findIndex((team) => team.id === fixture.awayTeamId);
    const [homeGoals, awayGoals] = homeIndex < awayIndex ? [2, 0] : [0, 2];
    return {
      id: `G-${index}`,
      match_number: 1000 + index,
      group_code: fixture.group,
      home_team_id: fixture.homeTeamId,
      away_team_id: fixture.awayTeamId,
      home_goals: homeGoals,
      away_goals: awayGoals,
      winner_team_id: null
    };
  });
  const knockoutRows = knockoutFixtures.map((fixture) => ({
    id: `M-${fixture.matchNumber}`,
    match_number: fixture.matchNumber,
    group_code: null,
    home_team_id: null,
    away_team_id: null,
    home_goals: null,
    away_goals: null,
    winner_team_id: null
  }));
  return [...groupRows, ...knockoutRows];
}

test("buildResolveKnockoutSlotsPlan maps DB rows into the engine's shape and resolves available slots", () => {
  const plan = buildResolveKnockoutSlotsPlan({ teamRows: buildTeamRows(), fixtureRows: buildFixtureRows() });

  assert.equal(plan.length, 16);
  assert.deepEqual(plan.find((entry) => entry.matchNumber === 73), {
    id: "M-73",
    matchNumber: 73,
    homeTeamId: "KOR",
    awayTeamId: "CAN"
  });
});

test("resolveKnockoutSlots in dry-run mode returns the plan without writing anything", async () => {
  const writer = {
    applyResolveKnockoutSlotsPlan: async () => {
      throw new Error("must not write in dry-run mode");
    }
  };

  const result = await resolveKnockoutSlots({
    teamRows: buildTeamRows(),
    fixtureRows: buildFixtureRows(),
    writer,
    apply: false
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.resolvedCount, 16);
});

test("resolveKnockoutSlots in apply mode writes each resolved entry and records a completed run", async () => {
  const applied = [];
  const recorded = [];
  const writer = {
    applyResolveKnockoutSlotsPlan: async (entry) => {
      applied.push(entry);
    },
    recordIngestionRun: async (run) => {
      recorded.push(run);
    }
  };

  const result = await resolveKnockoutSlots({
    teamRows: buildTeamRows(),
    fixtureRows: buildFixtureRows(),
    writer,
    apply: true
  });

  assert.equal(result.mode, "apply");
  assert.equal(applied.length, 16);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "completed");
  assert.equal(recorded[0].rowsChanged, 16);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test apps/ingestion-worker/test/resolve-knockout-slots.test.js
```
Expected: FAIL — `apps/ingestion-worker/src/sync/resolve-knockout-slots.js` doesn't exist yet.

- [ ] **Step 3: Implement the sync module**

Create `apps/ingestion-worker/src/sync/resolve-knockout-slots.js`:

```js
import { resolveRealKnockoutSlots } from "@wc/tournament-engine";

function toEngineTeam(row) {
  return {
    id: row.id,
    group: row.group_code,
    rating: Number(row.rating),
    fifaRanking: row.fifa_ranking ?? undefined
  };
}

function toEngineMatch(row) {
  return {
    matchNumber: row.match_number,
    group: row.group_code,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: row.home_goals ?? undefined,
    awayGoals: row.away_goals ?? undefined,
    winnerTeamId: row.winner_team_id
  };
}

export function buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows }) {
  const teamList = teamRows.map(toEngineTeam);
  const matches = fixtureRows.map(toEngineMatch);
  const idByMatchNumber = new Map(fixtureRows.map((row) => [row.match_number, row.id]));

  const resolved = resolveRealKnockoutSlots(teamList, matches);

  return [...resolved.entries()].map(([matchNumber, resolvedTeams]) => ({
    id: idByMatchNumber.get(matchNumber),
    matchNumber,
    homeTeamId: resolvedTeams.homeTeamId,
    awayTeamId: resolvedTeams.awayTeamId
  }));
}

export async function resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply }) {
  const plan = buildResolveKnockoutSlotsPlan({ teamRows, fixtureRows });

  if (!apply) {
    return { mode: "dry-run", resolvedCount: plan.length, plan };
  }

  let rowsChanged = 0;
  try {
    for (const entry of plan) {
      await writer.applyResolveKnockoutSlotsPlan(entry);
      rowsChanged += 1;
    }
    await writer.recordIngestionRun({
      source: "knockout-slot-resolution",
      status: "completed",
      rowsSeen: plan.length,
      rowsChanged,
      errorMessage: null,
      metadata: { resolved: plan.map((entry) => entry.matchNumber) }
    });
  } catch (error) {
    try {
      await writer.recordIngestionRun({
        source: "knockout-slot-resolution",
        status: "failed",
        rowsSeen: plan.length,
        rowsChanged,
        errorMessage: error.message,
        metadata: {}
      });
    } catch {
      // Preserve the original failure even if observability storage is unavailable.
    }
    throw error;
  }

  return { mode: "apply", resolvedCount: plan.length, plan };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test apps/ingestion-worker/test/resolve-knockout-slots.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Run the full ingestion-worker test suite**

```bash
npm run ingestion:test
```
Expected: existing 83 tests plus these 3 new ones, all pass (86 total).

- [ ] **Step 6: Commit**

```bash
git add apps/ingestion-worker/src/sync/resolve-knockout-slots.js apps/ingestion-worker/test/resolve-knockout-slots.test.js
git commit -m "feat: add knockout-slot-resolution sync module"
```

---

### Task 5: CLI Script And Final Verification

**Files:**
- Create: `apps/ingestion-worker/src/cli/resolve-knockout-slots.js`

**Interfaces:**
- Consumes: `createSupabaseWriter` (existing), `resolveKnockoutSlots` (Task 4).

- [ ] **Step 1: Create the CLI script**

Create `apps/ingestion-worker/src/cli/resolve-knockout-slots.js`:

```js
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { resolveKnockoutSlots } from "../sync/resolve-knockout-slots.js";

const apply = process.argv.includes("--apply");
const writer = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});
const { teamRows, fixtureRows } = await writer.loadAllFixturesAndTeams();
const result = await resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply });

console.log(JSON.stringify(result, null, 2));
```

This intentionally has no automated test — it's a thin wiring script with no logic of its own (same as `apps/ingestion-worker/src/cli/sync-espn-results.js`, which also has no dedicated test file; the logic it wires together is fully covered by Task 1, 3, and 4's tests).

- [ ] **Step 2: Add an npm script for discoverability**

In the repo root `package.json`, find this existing line:

```json
    "ingestion:sync-espn-results": "npm run sync-espn-results --workspace apps/ingestion-worker",
```

Add a new line directly after it:

```json
    "ingestion:resolve-knockout-slots": "node apps/ingestion-worker/src/cli/resolve-knockout-slots.js",
```

- [ ] **Step 3: Run the complete verification suite**

```bash
npm test
npm run ingestion:test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
```
Expected: all exit `0`. (`npm test` reports 191, `npm run ingestion:test` reports 86, both up from this plan's starting baselines of 187/83.)

- [ ] **Step 4: Manually verify the CLI script's dry-run output structure**

Without live Supabase credentials, this can't be run end-to-end in this environment. Instead, confirm by reading: `apps/ingestion-worker/src/cli/resolve-knockout-slots.js` calls `writer.loadAllFixturesAndTeams()` then `resolveKnockoutSlots(...)` with `apply` defaulting to `false` (since `--apply` isn't passed unless explicitly typed), so running it with real credentials and no flags is always a safe, read-only dry run that prints what WOULD be resolved — note this for the user as something to verify with real credentials once available, before ever running with `--apply`.

- [ ] **Step 5: Commit**

```bash
git add apps/ingestion-worker/src/cli/resolve-knockout-slots.js package.json
git commit -m "feat: add manual CLI entrypoint for knockout slot resolution"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/knockout-slot-resolution
gh pr create --base main --head feat/knockout-slot-resolution --title "feat: resolve real knockout bracket slots from finished group results" --body "See docs/superpowers/specs/2026-06-27-knockout-slot-resolution-design.md for the design."
```

- [ ] **Step 7: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.
