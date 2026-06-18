# Local Timezone Kickoff Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show fixture kickoff times in the viewer's detected local timezone with a short timezone abbreviation inline, while keeping the day-pill schedule grouping anchored to UTC for every viewer.

**Architecture:** Extract the three date/time formatting helpers currently hardcoded to `Asia/Seoul` inside `match-centre-app.tsx` into a new pure, testable module (`apps/web/lib/timezone-display.js`), parameterize them by timezone, and wire the component to detect the viewer's timezone client-side after mount (defaulting to `UTC` for the SSR pass and first paint, to avoid a hydration mismatch).

**Tech Stack:** Next.js App Router (client component), TypeScript, Node built-in test runner, `Intl.DateTimeFormat`.

---

## File Structure

- Create `apps/web/lib/timezone-display.js`
  - `detectViewerTimeZone()` — thin wrapper around `Intl.DateTimeFormat().resolvedOptions().timeZone`, isolated so call sites are easy to reason about and the rest of the module needs no mocking to test.
  - `formatKickoffDateKey(kickoff)` — always UTC; used for day-pill grouping, takes no timezone parameter by construction so it can never accidentally be wired to a viewer-specific zone.
  - `formatKickoffShortDate(kickoff, timeZone)` — short weekday/month/day string in the given zone.
  - `formatKickoffTime(kickoff, timeZone)` — hour:minute with an inline short timezone abbreviation (e.g. `"6:00 PM KST"`), in the given zone.
- Create `test/timezone-display.test.js` — tests the four functions above with fixed kickoff timestamps and fixed timezone arguments (no dependency on the test runner's own system timezone, except for the `detectViewerTimeZone` smoke test).
- Modify `apps/web/components/match-centre/match-centre-app.tsx`
  - Import the four functions from `../../lib/timezone-display` (adjust relative path to match this file's actual location) instead of defining `dateKey`/`shortDate`/`timeLabel` locally.
  - Add a `viewerTimeZone` state value, initialized to `"UTC"`, updated once via `useEffect` to the detected zone.
  - Thread `viewerTimeZone` into `FixtureCard` as a new prop, and into `scorerText` as a new parameter.

---

### Task 1: Add The Pure Timezone-Display Helpers

**Files:**
- Create: `apps/web/lib/timezone-display.js`
- Create: `test/timezone-display.test.js`

- [x] **Step 1: Write the failing tests**

Create `test/timezone-display.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  detectViewerTimeZone,
  formatKickoffDateKey,
  formatKickoffShortDate,
  formatKickoffTime
} from "../apps/web/lib/timezone-display.js";

const KICKOFF = "2026-06-19T01:00:00+00:00";

test("formatKickoffDateKey always groups by UTC regardless of caller intent", () => {
  assert.equal(formatKickoffDateKey(KICKOFF), "2026-06-19");
});

test("formatKickoffShortDate renders the date in the given zone, which can shift the day", () => {
  assert.equal(formatKickoffShortDate(KICKOFF, "Asia/Seoul"), "Fri, Jun 19");
  assert.equal(formatKickoffShortDate(KICKOFF, "America/New_York"), "Thu, Jun 18");
});

test("formatKickoffTime renders the time with an inline short zone abbreviation", () => {
  assert.equal(formatKickoffTime(KICKOFF, "Asia/Seoul"), "10:00 AM GMT+9");
  assert.equal(formatKickoffTime(KICKOFF, "America/New_York"), "9:00 PM EDT");
  assert.equal(formatKickoffTime(KICKOFF, "UTC"), "1:00 AM UTC");
});

test("detectViewerTimeZone returns a non-empty IANA zone string", () => {
  const zone = detectViewerTimeZone();
  assert.equal(typeof zone, "string");
  assert.ok(zone.length > 0);
});
```

- [x] **Step 2: Run the test and verify RED**

```bash
node --test test/timezone-display.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `apps/web/lib/timezone-display.js`.

- [x] **Step 3: Implement the helpers**

Create `apps/web/lib/timezone-display.js`:

```js
export function detectViewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatKickoffDateKey(kickoff) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(kickoff));
}

export function formatKickoffShortDate(kickoff, timeZone) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(kickoff));
}

export function formatKickoffTime(kickoff, timeZone) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(kickoff));
}
```

- [x] **Step 4: Run the test and verify GREEN**

```bash
node --test test/timezone-display.test.js
```

Expected: all 4 tests pass.

- [x] **Step 5: Run the full root test suite**

```bash
npm test
```

Expected: exits `0`, includes the 4 new tests alongside the existing suite.

- [x] **Step 6: Commit**

```bash
git add apps/web/lib/timezone-display.js test/timezone-display.test.js
git commit -m "feat: add pure timezone-aware kickoff formatting helpers"
```

---

### Task 2: Wire The Match Centre To Use Viewer-Local Times

**Files:**
- Modify: `apps/web/components/match-centre/match-centre-app.tsx`

- [x] **Step 1: Add the import and remove the old hardcoded helpers**

At the top of `apps/web/components/match-centre/match-centre-app.tsx`, add this import alongside the existing `@/lib/...` imports (after the `buildOutcomePresentation` import):

```ts
import {
  detectViewerTimeZone,
  formatKickoffDateKey,
  formatKickoffShortDate,
  formatKickoffTime
} from "@/lib/timezone-display";
```

Delete the three existing functions at the bottom of the file (found via `grep -n "^function dateKey\|^function shortDate\|^function timeLabel" apps/web/components/match-centre/match-centre-app.tsx`):

```ts
function dateKey(kickoff: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(kickoff));
}

function shortDate(kickoff: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(kickoff));
}

function timeLabel(kickoff: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(kickoff));
}
```

- [x] **Step 2: Add viewer-timezone state and detection**

In the `MatchCentreApp` function body, find this line:

```ts
  const [activeTab, setActiveTab] = useState<TabName>("fixtures");
```

Add a new state line directly after it:

```ts
  const [viewerTimeZone, setViewerTimeZone] = useState<string>("UTC");
```

Find the existing hash-routing `useEffect` (the one reading `window.location.hash`):

```ts
  useEffect(() => {
    const tab = window.location.hash.replace("#", "") as TabName;
    if (["fixtures", "standings", "bracket", "forecast"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);
```

Add a new `useEffect` directly after it that detects the viewer's timezone once on mount:

```ts
  useEffect(() => {
    setViewerTimeZone(detectViewerTimeZone());
  }, []);
```

- [x] **Step 3: Replace all `dateKey`/`shortDate` call sites with the new functions**

Replace every call site exactly as listed (find current line numbers via `grep -n "dateKey(\|shortDate(\|timeLabel(" apps/web/components/match-centre/match-centre-app.tsx`):

```ts
const [selectedDate, setSelectedDate] = useState<string>(() => dateKey(fixtures[0].kickoff));
```
becomes
```ts
const [selectedDate, setSelectedDate] = useState<string>(() => formatKickoffDateKey(fixtures[0].kickoff));
```

```ts
        .filter((match) => dateKey(match.kickoff) === selectedDate)
```
becomes
```ts
        .filter((match) => formatKickoffDateKey(match.kickoff) === selectedDate)
```

```ts
  const dateOptions = useMemo(() => [...new Set(fixtures.map((match) => dateKey(match.kickoff)))].sort(), []);
```
becomes
```ts
  const dateOptions = useMemo(() => [...new Set(fixtures.map((match) => formatKickoffDateKey(match.kickoff)))].sort(), []);
```

```ts
                    const dayMatches = fixtures.filter((match) => dateKey(match.kickoff) === day);
```
becomes
```ts
                    const dayMatches = fixtures.filter((match) => formatKickoffDateKey(match.kickoff) === day);
```

```ts
                        <strong>{shortDate(dayMatches[0].kickoff)}</strong>
```
becomes
```ts
                        <strong>{formatKickoffShortDate(dayMatches[0].kickoff, viewerTimeZone)}</strong>
```

```ts
                <div className="date-divider">{shortDate(visibleMatches[0].kickoff)}</div>
```
becomes
```ts
                <div className="date-divider">{formatKickoffShortDate(visibleMatches[0].kickoff, viewerTimeZone)}</div>
```

- [x] **Step 4: Thread `viewerTimeZone` into `FixtureCard`**

Find the `FixtureCard` render call:

```ts
                  <FixtureCard key={match.id} match={match} teamsById={teamsById} />
```

Replace with:

```ts
                  <FixtureCard key={match.id} match={match} teamsById={teamsById} viewerTimeZone={viewerTimeZone} />
```

Find the `FixtureCard` function signature:

```ts
function FixtureCard({ match, teamsById }: { match: AppFixture; teamsById: Record<string, AppTeam> }) {
```

Replace with:

```ts
function FixtureCard({
  match,
  teamsById,
  viewerTimeZone
}: {
  match: AppFixture;
  teamsById: Record<string, AppTeam>;
  viewerTimeZone: string;
}) {
```

Find the `scorerText` call inside `FixtureCard`:

```ts
      <div className="scorers">{scorerText(match)}</div>
```

Replace with:

```ts
      <div className="scorers">{scorerText(match, viewerTimeZone)}</div>
```

- [x] **Step 5: Update `scorerText` to accept and use the viewer timezone**

Find:

```ts
function scorerText(match: AppFixture) {
  if (!match.scorers.length) {
    return match.status === "FT" ? "No scorer data" : `${match.venue} · ${timeLabel(match.kickoff)}`;
  }

  return match.scorers.map((scorer) => `${scorer.player} ${scorer.minute}'`).join(" · ");
}
```

Replace with:

```ts
function scorerText(match: AppFixture, viewerTimeZone: string) {
  if (!match.scorers.length) {
    return match.status === "FT"
      ? "No scorer data"
      : `${match.venue} · ${formatKickoffTime(match.kickoff, viewerTimeZone)}`;
  }

  return match.scorers.map((scorer) => `${scorer.player} ${scorer.minute}'`).join(" · ");
}
```

- [x] **Step 6: Verify no other call sites remain**

```bash
grep -n "dateKey(\|shortDate(\|timeLabel(" apps/web/components/match-centre/match-centre-app.tsx
```

Expected: no matches (every call site now uses the imported `formatKickoff*` functions).

- [x] **Step 7: Run typecheck and build**

```bash
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Expected: both exit `0` with no new errors.

- [x] **Step 8: Run the full test suite and secret scan**

```bash
npm test
npm run secret:scan
git diff --check
```

Expected: all pass, no matches, no whitespace errors.

- [x] **Step 9: Commit**

```bash
git add apps/web/components/match-centre/match-centre-app.tsx
git commit -m "feat: show kickoff times in the viewer's local timezone"
```

---

### Task 3: Manual Browser Verification

**Files:** none (verification only)

- [x] **Step 1: Start the dev server**

```bash
npm run dev --workspace apps/web
```

- [x] **Step 2: Verify day-pill grouping is unaffected**

Using the `/browse` skill (or a regular browser), load the running app and confirm the day-pill match counts and groupings are unchanged from before this change (still anchored to the same UTC-day boundaries as previously observed in this project's verification history).

- [x] **Step 3: Verify displayed times changed and include a zone abbreviation**

Confirm fixture card times now read like `"6:00 PM KST"` or `"10:00 AM GMT+9"` style strings (exact abbreviation text depends on the browser's ICU data) rather than a bare time with no zone indicator.

- [x] **Step 4: Verify no hydration warning**

Check the browser console for any React hydration mismatch warning. Expected: none — the SSR pass and first client paint both use `UTC` before the `useEffect` swaps to the detected zone.

- [x] **Step 5: Record the result**

No code changes in this task; this is a verification gate only. Note the observed abbreviation and confirm no console errors before considering this plan complete.
