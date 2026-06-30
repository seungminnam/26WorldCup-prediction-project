# Tournament Bracket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bracket tab's Monte-Carlo-only "Projected Bracket" with a live "Tournament Bracket" that shows real confirmed results alongside model predictions in a single tree, with four match-card states (FT, Upcoming, Half-resolved, Pending) and click-to-expand prediction detail.

**Architecture:** A new pure data layer (`bracket-data.ts`) assembles the bracket structure from real Supabase fixture data and derives partially-resolved slot labels client-side (W##/L## only — group slots are handled by the backend cron). The component wires this into the existing tree/SVG-connector rendering, adds a per-match expand/collapse state, and removes the `forecast` guard so the bracket always shows. Model predictions are computed via the existing `predictMatch` helper — no simulation needed.

**Tech Stack:** Next.js 16, React, TypeScript, `@wc/tournament-engine` (for `knockoutFixtures`, `predictMatch`), `@/lib/prediction-presentation` (for `buildOutcomePresentation`), Node built-in test runner.

## Global Constraints

- Four match-card states: **FT** (real result + compact model row + click-expand), **Upcoming** (real teams + compact model row + click-expand), **Half-resolved** (one team confirmed, one still slot-display, no model prediction), **Pending** (both slot-display, no model prediction).
- Model prediction is computed only when BOTH `homeTeamId` and `awayTeamId` are non-null. Knockout matches use `isNeutralVenue: true`.
- The compact prediction row for FT matches shows a ✓ (model favored the actual winner) or ✗ (upset) indicator.
- Human-readable slot labels: `"1A"` → `"1st · Grp A"`, `"2B"` → `"2nd · Grp B"`, `"3 ABCDF"` → `"3rd best · A B C D F"`, `"W73"` → `"Winner M73"`, `"L84"` → `"Loser M84"`.
- Client-side W##/L## derivation only: group-slot derivation (e.g. "1E" → Germany) is left to the backend cron already in place.
- Bracket tab shows even when no forecast has been run (the `forecast &&` guard is removed/adjusted).
- The heading changes from "Projected Bracket / Sample scores from the latest forecast" to "Tournament Bracket / Results + model predictions".

---

## File Structure

- Create: `apps/web/lib/bracket-data.ts` — `ActualBracketMatch` type, `readableSlotLabel`, `deriveKnockoutWinner`, `buildActualBracketMatches`
- Create: `apps/web/test/bracket-data.test.js` — unit tests
- Modify: `apps/web/app/globals.css` — new bracket match-card CSS
- Modify: `apps/web/components/match-centre/match-centre-app.tsx` — component wiring

---

### Task 1: Bracket Data Layer

**Files:**
- Create: `apps/web/lib/bracket-data.ts`
- Create: `apps/web/test/bracket-data.test.js`

**Interfaces:**
- Produces: `ActualBracketMatch` type and `buildActualBracketMatches(fixtures, teams)` (consumed by Task 2). `readableSlotLabel` and `deriveKnockoutWinner` (used internally and tested directly).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/bracket-data.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readableSlotLabel, deriveKnockoutWinner, buildActualBracketMatches } from "../lib/bracket-data.ts";

test("readableSlotLabel renders group-finish slots", () => {
  assert.equal(readableSlotLabel("1A"), "1st · Grp A");
  assert.equal(readableSlotLabel("2L"), "2nd · Grp L");
  assert.equal(readableSlotLabel("3 ABCDF"), "3rd best · A B C D F");
});

test("readableSlotLabel renders bracket-reference slots", () => {
  assert.equal(readableSlotLabel("W73"), "Winner M73");
  assert.equal(readableSlotLabel("L84"), "Loser M84");
});

test("deriveKnockoutWinner returns null when match is not finished", () => {
  const fixture = { homeTeamId: "RSA", awayTeamId: "CAN", homeGoals: undefined, awayGoals: undefined, homePenalties: undefined, awayPenalties: undefined };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: null, loserId: null });
});

test("deriveKnockoutWinner derives winner from regular-time goals", () => {
  const fixture = { homeTeamId: "RSA", awayTeamId: "CAN", homeGoals: 0, awayGoals: 1, homePenalties: undefined, awayPenalties: undefined };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: "CAN", loserId: "RSA" });
});

test("deriveKnockoutWinner derives winner from penalties when regular time draws", () => {
  const fixture = { homeTeamId: "BRA", awayTeamId: "JPN", homeGoals: 1, awayGoals: 1, homePenalties: 4, awayPenalties: 3 };
  assert.deepEqual(deriveKnockoutWinner(fixture), { winnerId: "BRA", loserId: "JPN" });
});

test("buildActualBracketMatches emits FT match with winnerId from goals", () => {
  // Minimal synthetic fixtures: one FT knockout match (M73) + enough to satisfy slot resolution
  const fixtures = [
    { matchNumber: 73, stage: "round_of_32", homeTeamId: "RSA", awayTeamId: "CAN", homeSlot: "2A", awaySlot: "2B", homeGoals: 0, awayGoals: 1, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Los Angeles" },
    // All other knockout fixtures with null teams (status: Upcoming)
    { matchNumber: 74, stage: "round_of_32", homeTeamId: "GER", awayTeamId: null, homeSlot: "1E", awaySlot: "3 ABCDF", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-01T00:00:00Z", venue: "Boston" }
  ];
  const teams = [
    { id: "RSA", name: "South Africa" },
    { id: "CAN", name: "Canada" },
    { id: "GER", name: "Germany" }
  ];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const r32 = rounds["Round of 32"] ?? [];

  const m73 = r32.find((m) => m.matchNumber === 73);
  assert.ok(m73, "M73 should appear in Round of 32");
  assert.equal(m73.homeTeamId, "RSA");
  assert.equal(m73.awayTeamId, "CAN");
  assert.equal(m73.winnerTeamId, "CAN");
  assert.equal(m73.homeGoals, 0);
  assert.equal(m73.awayGoals, 1);
  assert.equal(m73.wentToPenalties, false);
});

test("buildActualBracketMatches emits half-resolved match with readable slot for unknown side", () => {
  const fixtures = [
    { matchNumber: 74, stage: "round_of_32", homeTeamId: "GER", awayTeamId: null, homeSlot: "1E", awaySlot: "3 ABCDF", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-01T00:00:00Z", venue: "Boston" }
  ];
  const teams = [{ id: "GER", name: "Germany" }];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const m74 = (rounds["Round of 32"] ?? []).find((m) => m.matchNumber === 74);
  assert.ok(m74);
  assert.equal(m74.homeTeamId, "GER");
  assert.equal(m74.awayTeamId, null);
  assert.equal(m74.awayDisplay, "3rd best · A B C D F");
  assert.equal(m74.winnerTeamId, null);
});

test("buildActualBracketMatches derives awayTeamId from W## reference when upstream match is finished", () => {
  const fixtures = [
    { matchNumber: 73, stage: "round_of_32", homeTeamId: "RSA", awayTeamId: "CAN", homeSlot: "2A", awaySlot: "2B", homeGoals: 0, awayGoals: 1, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Los Angeles" },
    { matchNumber: 75, stage: "round_of_32", homeTeamId: "NED", awayTeamId: "MAR", homeSlot: "1F", awaySlot: "2C", homeGoals: 2, awayGoals: 0, homePenalties: null, awayPenalties: null, status: "FT", kickoff: "2026-06-29T00:00:00Z", venue: "Monterrey" },
    { matchNumber: 90, stage: "round_of_16", homeTeamId: null, awayTeamId: null, homeSlot: "W73", awaySlot: "W75", homeGoals: null, awayGoals: null, homePenalties: null, awayPenalties: null, status: "Upcoming", kickoff: "2026-07-02T00:00:00Z", venue: "Houston" }
  ];
  const teams = [
    { id: "RSA", name: "South Africa" }, { id: "CAN", name: "Canada" }, { id: "NED", name: "Netherlands" }, { id: "MAR", name: "Morocco" }
  ];

  const rounds = buildActualBracketMatches(fixtures, teams);
  const m90 = (rounds["Round of 16"] ?? []).find((m) => m.matchNumber === 90);
  assert.ok(m90);
  assert.equal(m90.homeTeamId, "CAN");
  assert.equal(m90.awayTeamId, "NED");
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
node --test apps/web/test/bracket-data.test.js
```
Expected: FAIL — `bracket-data.ts` does not exist yet.

- [ ] **Step 3: Create `apps/web/lib/bracket-data.ts`**

```ts
import { knockoutFixtures } from "@wc/tournament-engine/data";
import type { AppFixture, AppTeam } from "@/lib/tournament-data";

export type ActualBracketMatch = {
  matchNumber: number;
  round: string;
  kickoff: string;
  venue: string;
  stadium: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeDisplay: string;
  awayDisplay: string;
  homeGoals?: number;
  awayGoals?: number;
  winnerTeamId: string | null;
  wentToPenalties: boolean;
};

const ROUND_NAMES: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  third_place: "Third place",
  final: "Final"
};

export function readableSlotLabel(slot: string): string {
  if (/^1[A-L]$/.test(slot)) return `1st · Grp ${slot[1]}`;
  if (/^2[A-L]$/.test(slot)) return `2nd · Grp ${slot[1]}`;
  if (/^3 [A-L]+$/.test(slot)) {
    const groups = slot.slice(2).split("").join(" ");
    return `3rd best · ${groups}`;
  }
  if (/^W(\d+)$/.test(slot)) return `Winner M${slot.slice(1)}`;
  if (/^L(\d+)$/.test(slot)) return `Loser M${slot.slice(1)}`;
  return slot;
}

export function deriveKnockoutWinner(fixture: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
}): { winnerId: string | null; loserId: string | null } {
  const { homeTeamId, awayTeamId, homeGoals, awayGoals, homePenalties, awayPenalties } = fixture;
  if (!homeTeamId || !awayTeamId || homeGoals == null || awayGoals == null) {
    return { winnerId: null, loserId: null };
  }
  let winnerId: string;
  if (homeGoals > awayGoals) {
    winnerId = homeTeamId;
  } else if (awayGoals > homeGoals) {
    winnerId = awayTeamId;
  } else {
    if (homePenalties == null || awayPenalties == null) return { winnerId: null, loserId: null };
    winnerId = homePenalties > awayPenalties ? homeTeamId : awayTeamId;
  }
  return { winnerId, loserId: winnerId === homeTeamId ? awayTeamId : homeTeamId };
}

export function buildActualBracketMatches(
  fixtures: AppFixture[],
  teams: AppTeam[]
): Record<string, ActualBracketMatch[]> {
  const fixtureByMatchNumber = new Map<number, AppFixture>(
    fixtures
      .filter((f) => f.stage !== "group" && f.matchNumber != null)
      .map((f) => [f.matchNumber, f])
  );

  // Derive winners/losers from already-completed knockout matches (for W##/L## slot resolution)
  const winnerByMatch = new Map<number, string>();
  const loserByMatch = new Map<number, string>();
  for (const [matchNumber, fixture] of fixtureByMatchNumber) {
    const { winnerId, loserId } = deriveKnockoutWinner(fixture);
    if (winnerId && loserId) {
      winnerByMatch.set(matchNumber, winnerId);
      loserByMatch.set(matchNumber, loserId);
    }
  }

  const resolveSlot = (slot: string): string | null => {
    const wMatch = slot.match(/^W(\d+)$/);
    if (wMatch) return winnerByMatch.get(Number(wMatch[1])) ?? null;
    const lMatch = slot.match(/^L(\d+)$/);
    if (lMatch) return loserByMatch.get(Number(lMatch[1])) ?? null;
    return null;
  };

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const teamDisplay = (teamId: string | null, slot: string): string => {
    if (teamId) return teamNameById.get(teamId) ?? teamId;
    const resolved = resolveSlot(slot);
    if (resolved) return teamNameById.get(resolved) ?? resolved;
    return readableSlotLabel(slot);
  };

  const result: Record<string, ActualBracketMatch[]> = {};

  for (const canonical of knockoutFixtures) {
    const roundName = ROUND_NAMES[canonical.stage];
    if (!roundName) continue;

    const real = fixtureByMatchNumber.get(canonical.matchNumber);

    const homeTeamId = real?.homeTeamId ?? resolveSlot(canonical.homeSlot);
    const awayTeamId = real?.awayTeamId ?? resolveSlot(canonical.awaySlot);

    const { winnerId, loserId: _ } = deriveKnockoutWinner(real ?? {});

    if (!result[roundName]) result[roundName] = [];
    result[roundName].push({
      matchNumber: canonical.matchNumber,
      round: roundName,
      kickoff: real?.kickoff ?? canonical.kickoff,
      venue: real?.venue ?? canonical.venue,
      stadium: canonical.stadium,
      homeTeamId,
      awayTeamId,
      homeDisplay: teamDisplay(real?.homeTeamId ?? null, canonical.homeSlot),
      awayDisplay: teamDisplay(real?.awayTeamId ?? null, canonical.awaySlot),
      homeGoals: real?.homeGoals,
      awayGoals: real?.awayGoals,
      winnerTeamId: winnerId,
      wentToPenalties: real?.homePenalties != null || real?.awayPenalties != null
    });
  }

  return result;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

```bash
node --test apps/web/test/bracket-data.test.js
```
Expected: all 7 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```
Expected: all tests pass (baseline + 7 new).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/bracket-data.ts apps/web/test/bracket-data.test.js
git commit -m "feat: add bracket data layer for real results + client-side slot derivation"
```

---

### Task 2: CSS Additions + Component Wiring

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`

**Interfaces:**
- Consumes: `ActualBracketMatch`, `buildActualBracketMatches`, `readableSlotLabel` from Task 1.

- [ ] **Step 1: Add CSS for the new match-card states**

In `apps/web/app/globals.css`, find the existing `.penalty-note` block (around line 1014) and add the following directly after it:

```css
.bracket-match.ft {
  border-color: var(--teal, #0f766e);
}

.bracket-match.pending {
  opacity: 0.6;
}

.match-chip.pending {
  color: var(--muted);
  font-weight: 600;
  font-style: italic;
}

.bracket-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 0;
  margin-top: 4px;
  border-top: 1px dashed var(--line);
  font-size: 0.75rem;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

.bracket-model-row:hover {
  color: var(--teal, #0f766e);
}

.bracket-model-correct {
  color: var(--win, #0f766e);
  font-weight: 800;
}

.bracket-model-wrong {
  color: #e05c5c;
  font-weight: 800;
}

.bracket-model-expanded {
  margin-top: 6px;
  padding: 8px;
  background: #f0fbf9;
  border-radius: 6px;
  font-size: 0.78rem;
  line-height: 1.6;
}

.bracket-model-expanded .probability-legend,
.bracket-model-expanded .probability-ribbon,
.bracket-model-expanded .likely-scorelines {
  margin-top: 4px;
}
```

- [ ] **Step 2: Add the import and state to the component**

Read `apps/web/components/match-centre/match-centre-app.tsx` before editing. Then:

**2a. Add import** — find the existing import on line 5:
```ts
import { buildOutcomePresentation, formatPercentagePointDelta } from "@/lib/prediction-presentation";
```
Add a new line directly below it:
```ts
import { buildActualBracketMatches } from "@/lib/bracket-data";
import type { ActualBracketMatch } from "@/lib/bracket-data";
```

Also add the `knockoutFixtures` import — find the existing `@wc/tournament-engine` import block (line 6 area) and add `knockoutFixtures` to it:
```ts
import {
  buildGroupTable,
  fixtures as fixtureSeed,
  isHostNationFixture,
  knockoutFixtures,
  predictMatch,
  rankGroup,
  runMonteCarlo,
  teams as teamSeed
} from "@wc/tournament-engine";
```

**2b. Add state** — find `const [forecastSeed, setForecastSeed] = useState<string | undefined>();` and add the new state directly after it:
```ts
const [expandedBracketMatches, setExpandedBracketMatches] = useState<Set<number>>(new Set());
```

**2c. Add memo** — find the `const thirdPlaceMatch` line and add the new memo directly above it:
```ts
  const actualBracketRounds = useMemo(
    () => buildActualBracketMatches(fixtures, teams),
    [fixtures, teams]
  );
  const thirdPlaceMatch = forecast?.sampleBracket.rounds["Third place"]?.[0];
```

**2d. Add toggle function** — find `function runForecast()` and add this directly above it:
```ts
  function toggleBracketMatch(matchNumber: number) {
    setExpandedBracketMatches((current) => {
      const next = new Set(current);
      if (next.has(matchNumber)) next.delete(matchNumber);
      else next.add(matchNumber);
      return next;
    });
  }
```

- [ ] **Step 3: Replace the bracket section JSX**

Find the existing bracket section (currently guarded by `{activeTab === "bracket" && forecast && (`). Replace the **entire** bracket section (from `{activeTab === "bracket" && forecast && (` through its matching closing `)}`) with the following:

```tsx
        {activeTab === "bracket" && (
          <section className="tab-panel active">
            <div className="panel bracket-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Knockout path</p>
                  <h2>Tournament Bracket</h2>
                </div>
                <span>Results + model predictions</span>
              </div>
              <div ref={bracketRef} className="bracket-stage">
                <svg className="bracket-connectors" aria-hidden="true" />
                <div className="bracket-columns">
                  {roundOrder.map((round) => (
                    <div key={round} className="round tree-round">
                      <h3>{round}</h3>
                      {(actualBracketRounds[round] ?? []).map((match, index) => {
                        const meta = bracketRoundMeta[round];
                        const isFt = match.winnerTeamId != null;
                        const isUpcoming = !isFt && match.homeTeamId != null && match.awayTeamId != null;
                        const isPending = !isFt && (match.homeTeamId == null || match.awayTeamId == null);
                        const expanded = expandedBracketMatches.has(match.matchNumber);

                        const homeTeam = match.homeTeamId ? teamsById[match.homeTeamId] : undefined;
                        const awayTeam = match.awayTeamId ? teamsById[match.awayTeamId] : undefined;
                        const prediction =
                          homeTeam && awayTeam
                            ? predictMatch(homeTeam, awayTeam, { isNeutralVenue: true })
                            : undefined;
                        const outcomes = prediction && homeTeam && awayTeam
                          ? buildOutcomePresentation({ homeName: homeTeam.name, awayName: awayTeam.name, probabilities: prediction.probabilities })
                          : [];

                        const modelCorrect =
                          isFt && prediction && homeTeam && awayTeam
                            ? (prediction.probabilities.homeWin >= prediction.probabilities.awayWin
                                ? match.winnerTeamId === match.homeTeamId
                                : match.winnerTeamId === match.awayTeamId)
                            : null;

                        const favoredWinPct = prediction
                          ? Math.max(prediction.probabilities.homeWin, prediction.probabilities.awayWin)
                          : null;
                        const favoredName = prediction && homeTeam && awayTeam
                          ? (prediction.probabilities.homeWin >= prediction.probabilities.awayWin ? homeTeam.name : awayTeam.name)
                          : null;

                        return (
                          <article
                            key={match.matchNumber}
                            className={`bracket-match${isFt ? " ft" : ""}${isPending ? " pending" : ""}`}
                            style={{ "--row-start": index * meta.interval + meta.offset } as React.CSSProperties}
                          >
                            <div className="match-location">
                              {match.stadium}, {match.venue} · M{match.matchNumber}
                            </div>

                            <div className={`match-chip${isFt && match.winnerTeamId === match.homeTeamId ? " winner" : ""}${isPending && !match.homeTeamId ? " pending" : ""}`}>
                              <span>
                                {homeTeam ? (
                                  <>{teamFlag(match.homeTeamId!, teamsById)} {homeTeam.name}</>
                                ) : (
                                  <span className="pending">{match.homeDisplay}</span>
                                )}
                              </span>
                              <span>{match.homeGoals ?? "-"}</span>
                            </div>

                            <div className={`match-chip${isFt && match.winnerTeamId === match.awayTeamId ? " winner" : ""}${isPending && !match.awayTeamId ? " pending" : ""}`}>
                              <span>
                                {awayTeam ? (
                                  <>{teamFlag(match.awayTeamId!, teamsById)} {awayTeam.name}</>
                                ) : (
                                  <span className="pending">{match.awayDisplay}</span>
                                )}
                              </span>
                              <span>{match.awayGoals ?? "-"}</span>
                            </div>

                            {match.wentToPenalties && (
                              <div className="penalty-note">Advanced after penalties</div>
                            )}

                            {prediction && (
                              <>
                                <div
                                  className="bracket-model-row"
                                  onClick={() => toggleBracketMatch(match.matchNumber)}
                                  role="button"
                                  aria-expanded={expanded}
                                >
                                  <span>
                                    {favoredName} {favoredWinPct != null ? `${Math.round(favoredWinPct * 100)}%` : ""}
                                    {isFt ? (
                                      modelCorrect
                                        ? <span className="bracket-model-correct"> ✓</span>
                                        : <span className="bracket-model-wrong"> ✗</span>
                                    ) : null}
                                  </span>
                                  <span>{expanded ? "▴" : "▾"}</span>
                                </div>

                                {expanded && (
                                  <div className="bracket-model-expanded">
                                    <div className="probability-legend" aria-label="Match outcome probabilities">
                                      {outcomes.map((outcome) => (
                                        <div key={outcome.key} className={`probability-legend-item ${outcome.key}`}>
                                          <span className="probability-name">
                                            <i className={`probability-dot ${outcome.key}`} aria-hidden="true" />
                                            {outcome.label}
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
                                    <div className="likely-scorelines" aria-label="Most likely scorelines">
                                      {prediction.scorelines.map((scoreline) => (
                                        <span key={`${scoreline.homeGoals}-${scoreline.awayGoals}`}>
                                          {scoreline.homeGoals}-{scoreline.awayGoals} {Math.round(scoreline.probability * 100)}%
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Third-place match */}
              {(() => {
                const r3 = (actualBracketRounds["Third place"] ?? [])[0];
                if (!r3) return null;
                const homeTeam = r3.homeTeamId ? teamsById[r3.homeTeamId] : undefined;
                const awayTeam = r3.awayTeamId ? teamsById[r3.awayTeamId] : undefined;
                return (
                  <div className="third-place-bracket">
                    <h3>Third place</h3>
                    <article className={`bracket-match${r3.winnerTeamId ? " ft" : ""}`}>
                      <div className="match-location">{r3.stadium}, {r3.venue} · M{r3.matchNumber}</div>
                      <div className={`match-chip${r3.winnerTeamId === r3.homeTeamId ? " winner" : ""}`}>
                        <span>{homeTeam ? <>{teamFlag(r3.homeTeamId!, teamsById)} {homeTeam.name}</> : <span className="pending">{r3.homeDisplay}</span>}</span>
                        <span>{r3.homeGoals ?? "-"}</span>
                      </div>
                      <div className={`match-chip${r3.winnerTeamId === r3.awayTeamId ? " winner" : ""}`}>
                        <span>{awayTeam ? <>{teamFlag(r3.awayTeamId!, teamsById)} {awayTeam.name}</> : <span className="pending">{r3.awayDisplay}</span>}</span>
                        <span>{r3.awayGoals ?? "-"}</span>
                      </div>
                      {r3.wentToPenalties && <div className="penalty-note">Advanced after penalties</div>}
                    </article>
                  </div>
                );
              })()}
            </div>
          </section>
        )}
```

- [ ] **Step 4: Run typecheck and build**

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```
Expected: both clean, no errors.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Manual verification**

```bash
npm run dev --workspace apps/web
```
Navigate to the Bracket tab. Without running a forecast, confirm:
- The bracket tree renders with real team names for completed matches (if any) and slot display labels for pending ones.
- Click a completed match's model row → probability bar + scorelines expand.
- Click again → collapses.
- FT matches have a green/teal border.
- The heading reads "Tournament Bracket" with subtitle "Results + model predictions".

Report in your task report what you actually saw (whether the Bracket tab shows with or without a forecast, which card states appeared, what the prediction row shows).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/components/match-centre/match-centre-app.tsx
git commit -m "feat: replace Projected Bracket with live Tournament Bracket (results + model predictions)"
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
git push -u origin feat/tournament-bracket
gh pr create --base main --head feat/tournament-bracket --title "feat: Tournament Bracket with real results and model predictions" --body "See docs/superpowers/specs/2026-06-30-tournament-bracket-design.md for the design."
```

- [ ] **Step 3: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.
