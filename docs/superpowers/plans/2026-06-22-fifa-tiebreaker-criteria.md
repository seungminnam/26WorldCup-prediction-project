# FIFA Tiebreaker Criteria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the documented MVP tiebreaker simplification with FIFA's actual published World Cup 2026 criteria (head-to-head, all-matches stats, conduct score, FIFA World Ranking) for both group standings and best-third-place selection.

**Architecture:** `ranking.js` gains a cluster-then-resolve algorithm (group teams by points, resolve each tied cluster via a head-to-head mini-table, fall through to a shared trailing comparator). ESPN's normalizer starts emitting card events into the same `match_events` pipeline goals already use. The public data-read layer threads cards through to the engine. A one-time migration adds real FIFA World Ranking data.

**Tech Stack:** Node.js ESM, TypeScript, Node built-in test runner, Supabase Postgres migrations.

## Global Constraints

- Within-group tiebreak order: head-to-head points → head-to-head goal difference → head-to-head goals scored → (if still tied) all-matches goal difference → all-matches goals scored → conduct score → FIFA World Ranking → team ID.
- Best-third-place tiebreak order (no head-to-head — different groups never play each other): points → all-matches goal difference → all-matches goals scored → conduct score → FIFA World Ranking → team ID.
- Conduct score: yellow card = −1, red card = −4, summed per team. A second-yellow dismissal will total −5 instead of FIFA's −3 (ESPN's data doesn't reliably distinguish the two) — documented, accepted limitation, not a bug to fix in this plan.
- FIFA World Ranking is a one-time static snapshot (not live-synced), sourced from the official June 11, 2026 FIFA/Coca-Cola Men's World Ranking update — the same pre-tournament freeze date FIFA itself uses for seeding.
- Lower FIFA ranking number is better, so it sorts ascending — every other criterion in the chain sorts descending.

---

## File Structure

- Modify `packages/tournament-engine/src/engine/ranking.js` — `buildGroupTable` adds a `conductScore` field (summed from `match.cards`). `rankGroup(rows, matches)` changes signature and implements the cluster-then-resolve algorithm. New exported `compareGroupStageRows` replaces `compareRows` as the trailing/fallback comparator (drops `rating`, adds `conductScore` then `fifaRanking`).
- Modify `packages/tournament-engine/src/engine/thirdPlace.js` — `selectBestThirdPlaceTeams` switches to `compareGroupStageRows`.
- Modify `packages/tournament-engine/src/engine/simulator.js` — `rankAllGroups`'s internal `rankGroup` call passes `groupMatches`.
- Modify `apps/web/components/match-centre/match-centre-app.tsx` — `buildStandings`'s `rankGroup` call passes `groupFixtures`.
- Delete `src/` and `test/engine.test.js` at the repo root — confirmed byte-identical, unreferenced duplicate of `packages/tournament-engine` predating the monorepo split (not listed in root `package.json`'s `workspaces`). Left alone, this change would silently fork it from the real implementation it duplicates.
- Create `packages/tournament-engine/test/ranking.test.js` and `packages/tournament-engine/test/thirdPlace.test.js` — the tests the deleted root `test/engine.test.js` is being replaced by, rewritten for the new algorithm (the old tiebreak-by-`rating` expectations are intentionally obsolete, not ported).
- Modify `apps/ingestion-worker/src/provider/espn.js` — `normalizeEvents` also emits `yellow_card`/`red_card` events.
- Modify `apps/ingestion-worker/test/espn.test.js` — update the existing finished-fixture expectation to include the yellow card already present in the sample payload (currently silently dropped), add a focused red-card classification test.
- Modify `apps/web/lib/tournament-data.ts` — `match_events` query adds `yellow_card`/`red_card` to its `event_type` filter; `AppFixture` type gains a `cards` field (Task 3). The `teams` query, `TeamRow`/`AppTeam` types, and `mapTeams` also gain `fifa_ranking`/`fifaRanking` (Task 4) — otherwise the FIFA-ranking tiebreak would stay wired-but-unpopulated in production.
- Modify `apps/web/lib/tournament-data-core.ts` — `mapFixtureRows` filters the existing `scorers` accumulation to goal-type events explicitly (no longer relying solely on the caller pre-filtering) and adds a parallel `cards` accumulation.
- Modify `apps/web/test/tournament-data-core.test.js` — covers the new `cards` field and confirms `scorers` excludes card rows when both are present in the same `eventRows` input.
- Create Supabase migration adding `teams.fifa_ranking` (backfilled for all 48 teams) — generated via `npx supabase migration new add_fifa_ranking`.
- Modify `supabase/schema.sql` — mirrors the new column.
- Modify `packages/tournament-engine/src/data/teams.js` — each team gains a `fifaRanking` field.
- Modify `scripts/generate-supabase-seed.mjs` — `teamsSql()` includes `fifa_ranking` in its generated insert.
- Modify `README.md` — updates the stale tiebreaker line and the now-inaccurate "Annex C ... not implemented yet" line (already shipped in a prior PR; noticed in passing while editing the adjacent line).

---

### Task 1: Head-To-Head Ranking Algorithm And Trailing Comparator

**Files:**
- Modify: `packages/tournament-engine/src/engine/ranking.js`
- Modify: `packages/tournament-engine/src/engine/thirdPlace.js`
- Modify: `packages/tournament-engine/src/engine/simulator.js`
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`
- Delete: `src/` (entire directory), `test/engine.test.js`
- Create: `packages/tournament-engine/test/ranking.test.js`
- Create: `packages/tournament-engine/test/thirdPlace.test.js`

**Interfaces:**
- Produces: `rankGroup(rows, matches = [])` (signature change — was `rankGroup(rows)`). `compareGroupStageRows(a, b)` (new export, replaces `compareRows`, which is removed). `buildGroupTable`'s output rows gain `conductScore` (number, 0 or negative) — this task wires the comparator to read it via `row.conductScore ?? 0` and `row.fifaRanking ?? Number.MAX_SAFE_INTEGER`, but does not yet populate either field from real data (Tasks 2-4 do).

- [ ] **Step 1: Confirm the legacy root duplicate is safe to delete**

```bash
diff src/engine/ranking.js packages/tournament-engine/src/engine/ranking.js
```

Expected: no output (files identical), confirming `src/` is an unreferenced fork of `packages/tournament-engine` rather than a divergent, in-use copy.

- [ ] **Step 2: Delete the legacy duplicate**

```bash
git rm -r src/ test/engine.test.js
```

Expected: removes the root `src/` tree and `test/engine.test.js`. This is not part of any npm workspace (`package.json`'s `workspaces` field only lists `apps/*` and `packages/*`) and is not referenced by `server.mjs`, `public/app.js`, or any build config.

- [ ] **Step 3: Write the failing ranking tests**

Create `packages/tournament-engine/test/ranking.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupTable, compareGroupStageRows, rankGroup } from "../src/engine/ranking.js";

const teams = [
  { id: "alpha", name: "Alpha", group: "A", rating: 1820 },
  { id: "bravo", name: "Bravo", group: "A", rating: 1710 },
  { id: "charlie", name: "Charlie", group: "A", rating: 1640 },
  { id: "delta", name: "Delta", group: "A", rating: 1510 }
];

test("buildGroupTable calculates points, goals, goal difference, and a zero conduct score with no cards", () => {
  const matches = [
    { group: "A", homeTeamId: "alpha", awayTeamId: "bravo", homeGoals: 2, awayGoals: 0 },
    { group: "A", homeTeamId: "charlie", awayTeamId: "delta", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "alpha", awayTeamId: "charlie", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "bravo", awayTeamId: "delta", homeGoals: 3, awayGoals: 2 },
    { group: "A", homeTeamId: "delta", awayTeamId: "alpha", homeGoals: 0, awayGoals: 2 },
    { group: "A", homeTeamId: "bravo", awayTeamId: "charlie", homeGoals: 0, awayGoals: 0 }
  ];

  const table = buildGroupTable(teams, matches);

  assert.deepEqual(table.find((row) => row.teamId === "alpha"), {
    teamId: "alpha",
    group: "A",
    played: 3,
    wins: 2,
    draws: 1,
    losses: 0,
    goalsFor: 5,
    goalsAgainst: 1,
    goalDifference: 4,
    points: 7,
    conductScore: 0,
    rating: 1820,
    fifaRanking: undefined
  });
});

test("buildGroupTable deducts conduct score for yellow and red cards", () => {
  const matches = [
    {
      group: "A",
      homeTeamId: "alpha",
      awayTeamId: "bravo",
      homeGoals: 1,
      awayGoals: 0,
      cards: [
        { teamId: "alpha", eventType: "yellow_card" },
        { teamId: "bravo", eventType: "red_card" },
        { teamId: "bravo", eventType: "yellow_card" }
      ]
    }
  ];

  const table = buildGroupTable(teams, matches);

  assert.equal(table.find((row) => row.teamId === "alpha").conductScore, -1);
  assert.equal(table.find((row) => row.teamId === "bravo").conductScore, -5);
});

test("rankGroup resolves a two-team tie by head-to-head result", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 0, goalsFor: 3 },
    { teamId: "b", group: "A", points: 4, goalDifference: 0, goalsFor: 3 }
  ];
  const matches = [{ group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 1 }];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b"]);
});

test("rankGroup resolves a three-team tie fully via the head-to-head mini-table", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 1, goalsFor: 3 },
    { teamId: "b", group: "A", points: 4, goalDifference: 1, goalsFor: 3 },
    { teamId: "c", group: "A", points: 4, goalDifference: -2, goalsFor: 1 }
  ];
  const matches = [
    { group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 1 },
    { group: "A", homeTeamId: "b", awayTeamId: "c", homeGoals: 2, awayGoals: 0 },
    { group: "A", homeTeamId: "c", awayTeamId: "a", homeGoals: 1, awayGoals: 3 }
  ];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b", "c"]);
});

test("rankGroup falls through to all-matches goal difference when the mini-table stays tied", () => {
  const rows = [
    { teamId: "a", group: "A", points: 4, goalDifference: 3, goalsFor: 6 },
    { teamId: "b", group: "A", points: 4, goalDifference: 1, goalsFor: 4 },
    { teamId: "c", group: "A", points: 4, goalDifference: -1, goalsFor: 3 }
  ];
  const matches = [
    { group: "A", homeTeamId: "a", awayTeamId: "b", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 1 },
    { group: "A", homeTeamId: "a", awayTeamId: "c", homeGoals: 1, awayGoals: 1 }
  ];

  assert.deepEqual(rankGroup(rows, matches).map((row) => row.teamId), ["a", "b", "c"]);
});

test("compareGroupStageRows breaks a points/goal-difference/goals-for tie by conduct score, then FIFA ranking", () => {
  const betterConduct = { teamId: "a", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 10 };
  const worseConduct = { teamId: "b", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -3, fifaRanking: 5 };
  assert.ok(compareGroupStageRows(betterConduct, worseConduct) < 0);

  const worseRanking = { teamId: "c", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -2, fifaRanking: 20 };
  const betterRanking = { teamId: "d", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -2, fifaRanking: 8 };
  assert.ok(compareGroupStageRows(worseRanking, betterRanking) > 0);
});

test("compareGroupStageRows treats missing conduct score and ranking as neutral, falling back to team id", () => {
  const a = { teamId: "a", points: 4, goalDifference: 0, goalsFor: 2 };
  const b = { teamId: "b", points: 4, goalDifference: 0, goalsFor: 2 };
  assert.ok(compareGroupStageRows(a, b) < 0);
});
```

- [ ] **Step 4: Run the tests and verify RED**

```bash
node --test packages/tournament-engine/test/ranking.test.js
```

Expected: FAIL — `compareGroupStageRows` is not exported yet, `rankGroup` doesn't accept a second argument, `buildGroupTable` doesn't produce `conductScore`.

- [ ] **Step 5: Implement the new ranking.js**

Replace the full contents of `packages/tournament-engine/src/engine/ranking.js`:

```js
const UNRANKED = Number.MAX_SAFE_INTEGER;

export function buildGroupTable(teams, matches) {
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        group: team.group,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        conductScore: 0,
        rating: team.rating,
        fifaRanking: team.fifaRanking
      }
    ])
  );

  for (const match of matches) {
    if (!Number.isFinite(match.homeGoals) || !Number.isFinite(match.awayGoals)) {
      continue;
    }

    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }

    for (const card of match.cards ?? []) {
      const row = rows.get(card.teamId);
      if (!row) continue;
      row.conductScore += card.eventType === "red_card" ? -4 : -1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()];
}

export function compareGroupStageRows(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (b.conductScore ?? 0) - (a.conductScore ?? 0) ||
    (a.fifaRanking ?? UNRANKED) - (b.fifaRanking ?? UNRANKED) ||
    a.teamId.localeCompare(b.teamId)
  );
}

export function rankGroup(rows, matches = []) {
  return clusterByPoints(rows).flatMap((cluster) => resolveCluster(cluster, matches));
}

function clusterByPoints(rows) {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  const clusters = [];

  for (const row of sorted) {
    const last = clusters.at(-1);
    if (last && last[0].points === row.points) {
      last.push(row);
    } else {
      clusters.push([row]);
    }
  }

  return clusters;
}

function resolveCluster(cluster, matches) {
  if (cluster.length === 1) {
    return cluster;
  }

  const teamIds = new Set(cluster.map((row) => row.teamId));
  const headToHeadMatches = matches.filter(
    (match) => teamIds.has(match.homeTeamId) && teamIds.has(match.awayTeamId)
  );
  const headToHeadTable = buildGroupTable(
    cluster.map((row) => ({ id: row.teamId, group: row.group, rating: row.rating })),
    headToHeadMatches
  );
  const headToHeadByTeamId = new Map(headToHeadTable.map((row) => [row.teamId, row]));

  return [...cluster].sort((a, b) => {
    const aHeadToHead = headToHeadByTeamId.get(a.teamId);
    const bHeadToHead = headToHeadByTeamId.get(b.teamId);

    return (
      bHeadToHead.points - aHeadToHead.points ||
      bHeadToHead.goalDifference - aHeadToHead.goalDifference ||
      bHeadToHead.goalsFor - aHeadToHead.goalsFor ||
      compareGroupStageRows(a, b)
    );
  });
}

export function rankAllGroups(teamList, matches) {
  const groups = [...new Set(teamList.map((team) => team.group))].sort();

  return groups.map((group) => {
    const groupTeams = teamList.filter((team) => team.group === group);
    const groupMatches = matches.filter((match) => match.group === group);
    return rankGroup(buildGroupTable(groupTeams, groupMatches), groupMatches);
  });
}
```

- [ ] **Step 6: Run the tests and verify GREEN**

```bash
node --test packages/tournament-engine/test/ranking.test.js
```

Expected: all 7 tests pass.

- [ ] **Step 7: Write the failing third-place test**

Create `packages/tournament-engine/test/thirdPlace.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { selectBestThirdPlaceTeams } from "../src/engine/thirdPlace.js";

test("selectBestThirdPlaceTeams picks the top eight third-place rows by points, goal difference, goals for", () => {
  const groupRankings = Array.from({ length: 12 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return [
      { teamId: `${group}1`, group, points: 9, goalDifference: 5, goalsFor: 7 },
      { teamId: `${group}2`, group, points: 6, goalDifference: 2, goalsFor: 5 },
      { teamId: `${group}3`, group, points: index, goalDifference: index - 5, goalsFor: index + 1 },
      { teamId: `${group}4`, group, points: 0, goalDifference: -6, goalsFor: 1 }
    ];
  });

  const bestThirds = selectBestThirdPlaceTeams(groupRankings);

  assert.equal(bestThirds.length, 8);
  assert.deepEqual(bestThirds.map((row) => row.group), ["L", "K", "J", "I", "H", "G", "F", "E"]);
});

test("selectBestThirdPlaceTeams breaks a full tie using conduct score then FIFA ranking", () => {
  const groupRankings = [
    [{}, {}, { teamId: "X3", group: "X", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 30 }],
    [{}, {}, { teamId: "Y3", group: "Y", points: 4, goalDifference: 0, goalsFor: 2, conductScore: -1, fifaRanking: 12 }]
  ];

  const bestThirds = selectBestThirdPlaceTeams(groupRankings);

  assert.deepEqual(bestThirds.map((row) => row.teamId), ["Y3", "X3"]);
});
```

- [ ] **Step 8: Run the test and verify RED**

```bash
node --test packages/tournament-engine/test/thirdPlace.test.js
```

Expected: FAIL — `thirdPlace.js` still imports the now-removed `compareRows`.

- [ ] **Step 9: Update thirdPlace.js**

In `packages/tournament-engine/src/engine/thirdPlace.js`, replace:

```js
import { compareRows } from "./ranking.js";

export function selectBestThirdPlaceTeams(groupRankings) {
  return groupRankings
    .map((ranking) => ranking[2])
    .filter(Boolean)
    .sort(compareRows)
    .slice(0, 8);
}
```

with:

```js
import { compareGroupStageRows } from "./ranking.js";

export function selectBestThirdPlaceTeams(groupRankings) {
  return groupRankings
    .map((ranking) => ranking[2])
    .filter(Boolean)
    .sort(compareGroupStageRows)
    .slice(0, 8);
}
```

- [ ] **Step 10: Run the test and verify GREEN**

```bash
node --test packages/tournament-engine/test/thirdPlace.test.js
```

Expected: both tests pass.

- [ ] **Step 11: Update the two real call sites**

In `packages/tournament-engine/src/engine/simulator.js`, this line already exists unchanged — no edit needed there, since `rankAllGroups` (just rewritten in Step 5) now passes `groupMatches` internally.

In `apps/web/components/match-centre/match-centre-app.tsx`, find:

```ts
function buildStandings(matchList: AppFixture[], teamList: AppTeam[]) {
  return groupLabels(teamList).map((group) => {
    const groupTeams = teamList.filter((team) => team.group === group);
    const groupFixtures = matchList.filter((match) => match.group === group);
    return rankGroup(buildGroupTable(groupTeams, groupFixtures));
  });
}
```

Replace the last line inside the `.map`:

```ts
function buildStandings(matchList: AppFixture[], teamList: AppTeam[]) {
  return groupLabels(teamList).map((group) => {
    const groupTeams = teamList.filter((team) => team.group === group);
    const groupFixtures = matchList.filter((match) => match.group === group);
    return rankGroup(buildGroupTable(groupTeams, groupFixtures), groupFixtures);
  });
}
```

- [ ] **Step 12: Run the full root and package test suites**

```bash
npm test
npm run typecheck --workspace apps/web
```

Expected: both exit `0`. The root suite no longer includes the deleted `test/engine.test.js`; it now includes the two new `packages/tournament-engine/test/*.test.js` files via the same recursive discovery.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: implement FIFA head-to-head and trailing tiebreaker criteria"
```

---

### Task 2: Capture Card Events From ESPN

**Files:**
- Modify: `apps/ingestion-worker/src/provider/espn.js`
- Modify: `apps/ingestion-worker/test/espn.test.js`

**Interfaces:**
- Produces: `normalizeEvents` (private) now also emits `eventType: "yellow_card"` / `"red_card"` entries, using the same `providerEventId` construction convention already used for goals (`fixtureId:teamId:clockSeconds:typeId:athleteId`).

- [ ] **Step 1: Update the existing finished-fixture test**

In `apps/ingestion-worker/test/espn.test.js`, find the `events` array inside the `"normalizes a finished ESPN fixture with goal events"` test (currently only two goal entries). The sample fixture (`espn-scoreboard.sample.json`, event `760415`) already contains a yellow-card detail at minute 17 for team `774` (player "Some Defender") between the two goals — it's just being silently dropped by the current `scoringPlay === true` filter. Update the expected `events` array to:

```js
    events: [
      {
        providerEventId: "760415:203:513:70:233075",
        providerTeamId: "203",
        playerName: "Julián Quiñones",
        assistPlayerName: null,
        minute: 9,
        stoppageMinute: null,
        eventType: "goal"
      },
      {
        providerEventId: "760415:774:981:94:256691",
        providerTeamId: "774",
        playerName: "Some Defender",
        assistPlayerName: null,
        minute: 17,
        stoppageMinute: null,
        eventType: "yellow_card"
      },
      {
        providerEventId: "760415:203:4023:137:167060",
        providerTeamId: "203",
        playerName: "Santiago Giménez",
        assistPlayerName: null,
        minute: 67,
        stoppageMinute: null,
        eventType: "goal"
      }
    ]
```

- [ ] **Step 2: Add a focused red-card classification test**

Add this test to the same file:

```js
test("classifies a red card event distinctly from a yellow card", () => {
  const event = {
    id: "999000",
    date: "2026-06-20T18:00Z",
    season: { year: 2026 },
    competitions: [
      {
        venue: { id: "1700", fullName: "Sample Arena" },
        altGameNote: "FIFA World Cup, Group A",
        status: { clock: 5400, type: { name: "STATUS_FULL_TIME" } },
        competitors: [
          { homeAway: "home", score: "1", team: { id: "203", displayName: "Mexico", abbreviation: "MEX" } },
          { homeAway: "away", score: "0", team: { id: "774", displayName: "South Africa", abbreviation: "RSA" } }
        ],
        details: [
          {
            type: { id: "93", text: "Red Card" },
            clock: { value: 3000, displayValue: "50'" },
            team: { id: "774" },
            scoringPlay: false,
            redCard: true,
            yellowCard: false,
            penaltyKick: false,
            ownGoal: false,
            athletesInvolved: [{ id: "300001", displayName: "Some Striker" }]
          }
        ]
      }
    ]
  };

  const result = normalizeEspnFixture(event);

  assert.deepEqual(result.events, [
    {
      providerEventId: "999000:774:3000:93:300001",
      providerTeamId: "774",
      playerName: "Some Striker",
      assistPlayerName: null,
      minute: 50,
      stoppageMinute: null,
      eventType: "red_card"
    }
  ]);
});
```

- [ ] **Step 3: Run the tests and verify RED**

```bash
node --test apps/ingestion-worker/test/espn.test.js
```

Expected: FAIL — the updated finished-fixture test is missing the yellow card entry (still filtered out), and the new red-card test gets an empty `events` array.

- [ ] **Step 4: Update normalizeEvents**

In `apps/ingestion-worker/src/provider/espn.js`, replace:

```js
function normalizeEvents(fixtureId, details) {
  return details
    .filter((detail) => detail.scoringPlay === true)
    .map((detail) => {
      const teamId = String(detail.team?.id ?? "");
      const athlete = detail.athletesInvolved?.[0];
      const athleteId = athlete?.id ?? "0";
      const { minute, stoppageMinute } = parseClockDisplay(detail.clock);

      return {
        providerEventId: `${fixtureId}:${teamId}:${Math.round(detail.clock?.value ?? 0)}:${detail.type?.id ?? "0"}:${athleteId}`,
        providerTeamId: teamId,
        playerName: athlete?.displayName ?? null,
        assistPlayerName: null,
        minute,
        stoppageMinute,
        eventType: detail.ownGoal ? "own_goal" : detail.penaltyKick ? "penalty_goal" : "goal"
      };
    });
}
```

with:

```js
function normalizeEvents(fixtureId, details) {
  return details
    .filter((detail) => detail.scoringPlay === true || detail.yellowCard === true || detail.redCard === true)
    .map((detail) => {
      const teamId = String(detail.team?.id ?? "");
      const athlete = detail.athletesInvolved?.[0];
      const athleteId = athlete?.id ?? "0";
      const { minute, stoppageMinute } = parseClockDisplay(detail.clock);

      return {
        providerEventId: `${fixtureId}:${teamId}:${Math.round(detail.clock?.value ?? 0)}:${detail.type?.id ?? "0"}:${athleteId}`,
        providerTeamId: teamId,
        playerName: athlete?.displayName ?? null,
        assistPlayerName: null,
        minute,
        stoppageMinute,
        eventType: classifyEventType(detail)
      };
    });
}

function classifyEventType(detail) {
  if (detail.redCard) return "red_card";
  if (detail.yellowCard) return "yellow_card";
  if (detail.ownGoal) return "own_goal";
  if (detail.penaltyKick) return "penalty_goal";
  return "goal";
}
```

- [ ] **Step 5: Run the tests and verify GREEN**

```bash
node --test apps/ingestion-worker/test/espn.test.js
```

Expected: all tests pass, including the two from this task.

- [ ] **Step 6: Run the full worker suite**

```bash
npm run ingestion:test
```

Expected: exits `0`, no regressions (the `sync-espn-live` and `compare-football-data` suites don't depend on `normalizeEvents`'s internal filtering, only on its output shape, which is unchanged for goal-type events).

- [ ] **Step 7: Commit**

```bash
git add apps/ingestion-worker/src/provider/espn.js apps/ingestion-worker/test/espn.test.js
git commit -m "feat: capture card events from ESPN for conduct scoring"
```

---

### Task 3: Thread Card Events Through The Public Data Layer

**Files:**
- Modify: `apps/web/lib/tournament-data.ts`
- Modify: `apps/web/lib/tournament-data-core.ts`
- Modify: `apps/web/test/tournament-data-core.test.js`

**Interfaces:**
- Consumes: `match_events` rows shaped `{ fixture_id, team_id, player_name, minute, event_type }` (unchanged shape, now including `"yellow_card"`/`"red_card"` rows after Task 2).
- Produces: `mapFixtureRows` output fixtures gain a `cards: Array<{ teamId: string; player: string; minute: number; eventType: string }>` field alongside the existing `scorers` field. `AppFixture` type reflects this.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/tournament-data-core.test.js`:

```js
test("separates card events from goal events into a distinct cards array", () => {
  const [fixture] = mapFixtureRows(
    [
      {
        id: "A-1",
        match_number: 1,
        group_code: "A",
        stage: "group",
        kickoff_at: "2026-06-11T19:00:00Z",
        status: "final",
        home_goals: 2,
        away_goals: 0,
        venue_name: "Estadio Banorte",
        venue_city: "Mexico City",
        home_team_id: "MEX",
        away_team_id: "RSA",
        home_slot: "MEX",
        away_slot: "RSA"
      }
    ],
    [
      { fixture_id: "A-1", team_id: "MEX", player_name: "Julián Quiñones", minute: 9, event_type: "goal" },
      { fixture_id: "A-1", team_id: "RSA", player_name: "Some Defender", minute: 17, event_type: "yellow_card" },
      { fixture_id: "A-1", team_id: "RSA", player_name: "Some Striker", minute: 80, event_type: "red_card" }
    ]
  );

  assert.deepEqual(fixture.scorers, [{ teamId: "MEX", player: "Julián Quiñones", minute: 9 }]);
  assert.deepEqual(fixture.cards, [
    { teamId: "RSA", player: "Some Defender", minute: 17, eventType: "yellow_card" },
    { teamId: "RSA", player: "Some Striker", minute: 80, eventType: "red_card" }
  ]);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test apps/web/test/tournament-data-core.test.js
```

Expected: FAIL — `fixture.cards` is `undefined`, and `fixture.scorers` currently includes the card rows too (the existing accumulation doesn't filter by `event_type` at all, relying on the caller to pre-filter).

- [ ] **Step 3: Update mapFixtureRows**

In `apps/web/lib/tournament-data-core.ts`, find:

```ts
export function mapFixtureRows(rows: any[], eventRows: any[]) {
  const eventsByFixture = eventRows.reduce<Record<string, any[]>>((accumulator, row) => {
    if (!row.team_id) return accumulator;
    accumulator[row.fixture_id] ??= [];
    accumulator[row.fixture_id].push({
      teamId: row.team_id,
      player: row.player_name,
      minute: row.minute
    });
    return accumulator;
  }, {});

  return rows.map((row) => ({
```

Replace with:

```ts
export function mapFixtureRows(rows: any[], eventRows: any[]) {
  const eventsByFixture = eventRows
    .filter((row) => row.event_type === "goal" || row.event_type === "own_goal" || row.event_type === "penalty_goal")
    .reduce<Record<string, any[]>>((accumulator, row) => {
      if (!row.team_id) return accumulator;
      accumulator[row.fixture_id] ??= [];
      accumulator[row.fixture_id].push({
        teamId: row.team_id,
        player: row.player_name,
        minute: row.minute
      });
      return accumulator;
    }, {});

  const cardsByFixture = eventRows
    .filter((row) => row.event_type === "yellow_card" || row.event_type === "red_card")
    .reduce<Record<string, any[]>>((accumulator, row) => {
      if (!row.team_id) return accumulator;
      accumulator[row.fixture_id] ??= [];
      accumulator[row.fixture_id].push({
        teamId: row.team_id,
        player: row.player_name,
        minute: row.minute,
        eventType: row.event_type
      });
      return accumulator;
    }, {});

  return rows.map((row) => ({
```

Then find the closing object literal inside the same `rows.map`:

```ts
    scorers: eventsByFixture[row.id] ?? []
  }));
}
```

Replace with:

```ts
    scorers: eventsByFixture[row.id] ?? [],
    cards: cardsByFixture[row.id] ?? []
  }));
}
```

- [ ] **Step 4: Run the test and verify GREEN**

```bash
node --test apps/web/test/tournament-data-core.test.js
```

Expected: all tests pass, including the existing ones (the new `.filter()` is a no-op when `eventRows` only contains goal-type rows, which is what the existing tests pass in).

- [ ] **Step 5: Update tournament-data.ts**

In `apps/web/lib/tournament-data.ts`, find:

```ts
    supabase
      .from("match_events")
      .select("fixture_id,team_id,player_name,minute,event_type")
      .in("event_type", ["goal", "own_goal", "penalty_goal"])
      .order("minute")
```

Replace with:

```ts
    supabase
      .from("match_events")
      .select("fixture_id,team_id,player_name,minute,event_type")
      .in("event_type", ["goal", "own_goal", "penalty_goal", "yellow_card", "red_card"])
      .order("minute")
```

Find the `AppFixture` type definition's `scorers` line:

```ts
  scorers: Array<{ teamId: string; player: string; minute: number }>;
```

Add directly after it:

```ts
  cards: Array<{ teamId: string; player: string; minute: number; eventType: string }>;
```

- [ ] **Step 6: Run typecheck and build**

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Expected: both exit `0`.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: exits `0`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/tournament-data.ts apps/web/lib/tournament-data-core.ts apps/web/test/tournament-data-core.test.js
git commit -m "feat: thread card events through the public data layer"
```

---

### Task 4: Add Real FIFA World Ranking Data

**Files:**
- Create: generated `supabase/migrations/*_add_fifa_ranking.sql`
- Modify: `supabase/schema.sql`
- Modify: `packages/tournament-engine/src/data/teams.js`
- Modify: `scripts/generate-supabase-seed.mjs`
- Modify: `README.md`

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new add_fifa_ranking
```

- [ ] **Step 2: Add the column and backfill it**

Paste into the generated migration file. Values are each team's FIFA/Coca-Cola Men's World Ranking position from the official June 11, 2026 update (the pre-tournament freeze FIFA itself used for seeding):

```sql
begin;

alter table public.teams add column if not exists fifa_ranking integer;

update public.teams set fifa_ranking = 14 where id = 'MEX';
update public.teams set fifa_ranking = 60 where id = 'RSA';
update public.teams set fifa_ranking = 25 where id = 'KOR';
update public.teams set fifa_ranking = 40 where id = 'CZE';
update public.teams set fifa_ranking = 30 where id = 'CAN';
update public.teams set fifa_ranking = 64 where id = 'BIH';
update public.teams set fifa_ranking = 56 where id = 'QAT';
update public.teams set fifa_ranking = 19 where id = 'SUI';
update public.teams set fifa_ranking = 83 where id = 'HAI';
update public.teams set fifa_ranking = 42 where id = 'SCO';
update public.teams set fifa_ranking = 6 where id = 'BRA';
update public.teams set fifa_ranking = 7 where id = 'MAR';
update public.teams set fifa_ranking = 17 where id = 'USA';
update public.teams set fifa_ranking = 41 where id = 'PAR';
update public.teams set fifa_ranking = 27 where id = 'AUS';
update public.teams set fifa_ranking = 22 where id = 'TUR';
update public.teams set fifa_ranking = 33 where id = 'CIV';
update public.teams set fifa_ranking = 23 where id = 'ECU';
update public.teams set fifa_ranking = 10 where id = 'GER';
update public.teams set fifa_ranking = 82 where id = 'CUW';
update public.teams set fifa_ranking = 8 where id = 'NED';
update public.teams set fifa_ranking = 18 where id = 'JPN';
update public.teams set fifa_ranking = 38 where id = 'SWE';
update public.teams set fifa_ranking = 45 where id = 'TUN';
update public.teams set fifa_ranking = 20 where id = 'IRN';
update public.teams set fifa_ranking = 85 where id = 'NZL';
update public.teams set fifa_ranking = 9 where id = 'BEL';
update public.teams set fifa_ranking = 29 where id = 'EGY';
update public.teams set fifa_ranking = 61 where id = 'KSA';
update public.teams set fifa_ranking = 16 where id = 'URU';
update public.teams set fifa_ranking = 2 where id = 'ESP';
update public.teams set fifa_ranking = 67 where id = 'CPV';
update public.teams set fifa_ranking = 3 where id = 'FRA';
update public.teams set fifa_ranking = 15 where id = 'SEN';
update public.teams set fifa_ranking = 57 where id = 'IRQ';
update public.teams set fifa_ranking = 31 where id = 'NOR';
update public.teams set fifa_ranking = 1 where id = 'ARG';
update public.teams set fifa_ranking = 28 where id = 'ALG';
update public.teams set fifa_ranking = 24 where id = 'AUT';
update public.teams set fifa_ranking = 63 where id = 'JOR';
update public.teams set fifa_ranking = 5 where id = 'POR';
update public.teams set fifa_ranking = 46 where id = 'COD';
update public.teams set fifa_ranking = 50 where id = 'UZB';
update public.teams set fifa_ranking = 13 where id = 'COL';
update public.teams set fifa_ranking = 73 where id = 'GHA';
update public.teams set fifa_ranking = 34 where id = 'PAN';
update public.teams set fifa_ranking = 4 where id = 'ENG';
update public.teams set fifa_ranking = 11 where id = 'CRO';

alter table public.teams alter column fifa_ranking set not null;
alter table public.teams add constraint teams_fifa_ranking_check check (fifa_ranking > 0);

commit;
```

- [ ] **Step 3: Apply the migration locally first if possible, otherwise to the linked project**

```bash
npx supabase db push --linked
```

Expected: migration applies with no errors (all 48 `update` statements match an existing team row — there are exactly 48 rows in `public.teams`, one per `id` used above).

- [ ] **Step 4: Verify**

```bash
echo "select count(*) as total, count(fifa_ranking) as with_ranking, min(fifa_ranking) as best, max(fifa_ranking) as worst from public.teams;" > /tmp/verify_fifa_ranking.sql
npx supabase db query --linked --output json -f /tmp/verify_fifa_ranking.sql
```

Expected: `total` and `with_ranking` both equal `48`; `best` is `1` (Argentina); `worst` is `85` (New Zealand).

- [ ] **Step 5: Mirror the column in schema.sql**

In `supabase/schema.sql`, find the `rating` column inside `create table public.teams (`:

```sql
  rating numeric(7, 2) not null check (rating > 0),
```

Add directly after it:

```sql
  fifa_ranking integer not null check (fifa_ranking > 0),
```

- [ ] **Step 6: Add fifaRanking to the static fallback data**

In `packages/tournament-engine/src/data/teams.js`, add a `fifaRanking` field to every team entry using the same 48 values from Step 2. For example, the first few entries become:

```js
export const teams = [
  { id: "MEX", name: "Mexico", group: "A", rating: 1715, fifaRanking: 14 },
  { id: "RSA", name: "South Africa", group: "A", rating: 1530, fifaRanking: 60 },
  { id: "KOR", name: "Korea Republic", group: "A", rating: 1660, fifaRanking: 25 },
  { id: "CZE", name: "Czechia", group: "A", rating: 1645, fifaRanking: 40 },
```

Apply the same `, fifaRanking: <value>` addition to all 48 entries, matching each `id` to the value used in Step 2's migration (`MEX` → 14, `RSA` → 60, `KOR` → 25, `CZE` → 40, `CAN` → 30, `BIH` → 64, `QAT` → 56, `SUI` → 19, `HAI` → 83, `SCO` → 42, `BRA` → 6, `MAR` → 7, `USA` → 17, `PAR` → 41, `AUS` → 27, `TUR` → 22, `CIV` → 33, `ECU` → 23, `GER` → 10, `CUW` → 82, `NED` → 8, `JPN` → 18, `SWE` → 38, `TUN` → 45, `IRN` → 20, `NZL` → 85, `BEL` → 9, `EGY` → 29, `KSA` → 61, `URU` → 16, `ESP` → 2, `CPV` → 67, `FRA` → 3, `SEN` → 15, `IRQ` → 57, `NOR` → 31, `ARG` → 1, `ALG` → 28, `AUT` → 24, `JOR` → 63, `POR` → 5, `COD` → 46, `UZB` → 50, `COL` → 13, `GHA` → 73, `PAN` → 34, `ENG` → 4, `CRO` → 11).

- [ ] **Step 7: Wire fifaRanking through the Supabase-backed read path**

`packages/tournament-engine/src/engine/ranking.js`'s `buildGroupTable` (Task 1) already copies `team.fifaRanking` onto each row — but it only receives whatever team objects its caller passes in. The production caller, `apps/web/components/match-centre/match-centre-app.tsx`'s `buildStandings`, receives its team list from `getTournamentData()` in `apps/web/lib/tournament-data.ts`, which has not been reading `fifa_ranking` from Supabase at all. Without this step, `fifaRanking` would stay `undefined` for every real (non-fallback) row even after this task, silently defeating the comparator's FIFA-ranking tiebreak in production.

In `apps/web/lib/tournament-data.ts`, find:

```ts
    supabase.from("teams").select("id,name,group_code,rating,flag_emoji").order("group_code").order("id"),
```

Replace with:

```ts
    supabase.from("teams").select("id,name,group_code,rating,fifa_ranking,flag_emoji").order("group_code").order("id"),
```

Find the `TeamRow` type:

```ts
type TeamRow = {
  id: string;
  name: string;
  group_code: string;
  rating: number | string;
  flag_emoji: string | null;
};
```

Add a field:

```ts
type TeamRow = {
  id: string;
  name: string;
  group_code: string;
  rating: number | string;
  fifa_ranking: number;
  flag_emoji: string | null;
};
```

Find the `AppTeam` type:

```ts
export type AppTeam = {
  id: string;
  name: string;
  group: string;
  rating: number;
  flagEmoji?: string;
};
```

Add a field:

```ts
export type AppTeam = {
  id: string;
  name: string;
  group: string;
  rating: number;
  fifaRanking: number;
  flagEmoji?: string;
};
```

Find `mapTeams`:

```ts
function mapTeams(rows: TeamRow[]): AppTeam[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    group: row.group_code,
    rating: Number(row.rating),
    flagEmoji: row.flag_emoji ?? undefined
  }));
}
```

Replace with:

```ts
function mapTeams(rows: TeamRow[]): AppTeam[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    group: row.group_code,
    rating: Number(row.rating),
    fifaRanking: Number(row.fifa_ranking),
    flagEmoji: row.flag_emoji ?? undefined
  }));
}
```

- [ ] **Step 8: Update the seed generator**

In `scripts/generate-supabase-seed.mjs`, find the `teamsSql()` function's column list and value mapping:

```js
function teamsSql() {
  const values = teams.map((team) =>
    `(${literal(team.id)}, ${literal(team.id)}, ${literal(team.name)}, ${literal(team.name)}, ${literal(
      team.id
    )}, ${literal(team.id)}, ${literal(team.group)}, ${team.rating}, ${literal(flagEmoji[team.id] ?? null)})`
  );

  return [
    "insert into public.teams (id, fifa_code, name, official_name, short_name, country_code, group_code, rating, flag_emoji)",
```

Replace with:

```js
function teamsSql() {
  const values = teams.map((team) =>
    `(${literal(team.id)}, ${literal(team.id)}, ${literal(team.name)}, ${literal(team.name)}, ${literal(
      team.id
    )}, ${literal(team.id)}, ${literal(team.group)}, ${team.rating}, ${team.fifaRanking}, ${literal(flagEmoji[team.id] ?? null)})`
  );

  return [
    "insert into public.teams (id, fifa_code, name, official_name, short_name, country_code, group_code, rating, fifa_ranking, flag_emoji)",
```

Then find the matching `on conflict` clause a few lines below:

```js
    "on conflict (id) do update set",
    "  fifa_code = excluded.fifa_code,",
    "  name = excluded.name,",
    "  official_name = excluded.official_name,",
    "  short_name = excluded.short_name,",
    "  country_code = excluded.country_code,",
    "  group_code = excluded.group_code,",
    "  rating = excluded.rating,",
    "  flag_emoji = excluded.flag_emoji;"
```

Add a line for the new column:

```js
    "on conflict (id) do update set",
    "  fifa_code = excluded.fifa_code,",
    "  name = excluded.name,",
    "  official_name = excluded.official_name,",
    "  short_name = excluded.short_name,",
    "  country_code = excluded.country_code,",
    "  group_code = excluded.group_code,",
    "  rating = excluded.rating,",
    "  fifa_ranking = excluded.fifa_ranking,",
    "  flag_emoji = excluded.flag_emoji;"
```

- [ ] **Step 9: Regenerate the seed file**

```bash
npm run db:seed:generate
```

Expected: `supabase/seed.sql` regenerates with `fifa_ranking` included in the teams insert, with no other unrelated diff (run `git diff supabase/seed.sql` to confirm only the teams section changed).

- [ ] **Step 10: Update README**

In `README.md`, find:

```markdown
- The group ranking engine uses MVP tie-breakers: points, goal difference, goals for, then rating.
```

Replace with:

```markdown
- The group ranking engine implements FIFA's published tiebreaker criteria: head-to-head points/goal-difference/goals-scored among tied teams, then all-matches goal difference, goals scored, team conduct score, and FIFA World Ranking. FIFA World Ranking is a one-time pre-tournament snapshot, not live-synced. Card-based conduct scoring cannot distinguish a second-yellow dismissal from a straight red card with ESPN's data, so it is scored as the sum of both deductions.
```

Find:

```markdown
- The official FIFA Annex C third-place assignment table is not implemented yet.
```

Delete this line — it shipped in a prior PR (`packages/tournament-engine/src/data/third-place-assignments.js`) and is no longer accurate. Noticed while editing the adjacent line above.

- [ ] **Step 11: Run full verification**

```bash
npm test
npm run ingestion:test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
npm run audit:fixtures
git diff --check
```

Expected: all exit `0`; `audit:fixtures` is unaffected by this task (it doesn't touch `teams.fifa_ranking`) and should still report zero drift.

- [ ] **Step 12: Commit**

```bash
git add supabase/schema.sql supabase/migrations supabase/seed.sql packages/tournament-engine/src/data/teams.js apps/web/lib/tournament-data.ts scripts/generate-supabase-seed.mjs README.md
git commit -m "feat: add FIFA World Ranking as the final tiebreaker"
```

---

### Task 5: Final Verification And Push

**Files:** none (verification and operational steps only)

- [ ] **Step 1: Run the complete verification suite one more time**

```bash
npm test
npm run ingestion:test
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
npm run secret:scan
npm run audit:fixtures
git status --short
```

Expected: all checks pass; working tree clean (everything committed).

- [ ] **Step 2: Browser-verify the standings tab**

Start the dev server and confirm the Standings tab still renders all 12 groups with no console errors or layout regressions, using the `/browse` skill or a regular browser:

```bash
npm run dev --workspace apps/web
```

This pass doesn't change any visible UI (conduct score and FIFA ranking only affect sort order, per the design's non-goals), so the only expected difference from before this plan is that any group with a tiebreak-relevant tie now sorts according to the real FIFA order instead of the old `rating` fallback — confirm at least one group's standings order against the live data to sanity-check nothing looks obviously wrong (e.g. no team appears twice, all 4 rows present per group).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/fifa-tiebreaker-criteria
gh pr create --base main --head feat/fifa-tiebreaker-criteria --title "feat: implement FIFA tiebreaker criteria for group standings and best-third-place selection" --body "See docs/superpowers/specs/2026-06-22-fifa-tiebreaker-criteria-design.md and docs/superpowers/plans/2026-06-22-fifa-tiebreaker-criteria.md for the full design, decisions, and test evidence."
```

- [ ] **Step 4: Confirm CI passes**

```bash
gh pr checks
```

Expected: `Test, Build, And Scan` passes.
