# Local Timezone Kickoff Display Design

## Goal

Show fixture kickoff times in the viewer's own local timezone instead of a hardcoded zone, with a short timezone abbreviation next to each displayed time so it's always clear what zone is being shown.

## Context

`apps/web/components/match-centre/match-centre-app.tsx` already formats kickoff times via three helper functions (`dateKey`, `shortDate`, `timeLabel`), but all three hardcode `timeZone: "Asia/Seoul"`. Every viewer currently sees Seoul time regardless of where they actually are. `kickoff_at` is stored and passed through as a UTC ISO timestamp (e.g. `2026-06-19T01:00:00+00:00`), so no data model change is needed — this is a presentation-only change.

## Decision

- **Day-pill grouping stays anchored to UTC**, not the viewer's local zone. `dateKey()` switches from `Asia/Seoul` to `UTC`. This keeps "how many matches are on this day" and which matches appear under which pill identical for every viewer, avoiding fixtures jumping between day groups or a pill's count changing depending on who's looking. This matches how major sports schedule UIs (ESPN, FIFA) anchor the daily schedule structure independent of viewer location while only converting displayed clock times.
- **Displayed times (`shortDate`, `timeLabel`) convert to the viewer's detected local timezone**, with a short timezone abbreviation appended inline (e.g. `6:00 PM KST`, `Mexico City · 6:00 PM KST`). This matches the common sports-schedule convention of stating the zone next to the time (e.g. US sports listings showing "7:00 PM ET") and directly answers "what timezone am I looking at" without a separate banner element repeating the same fixed information on every render.
- No separate "times shown in your timezone" banner. It would just repeat the same abbreviation already stated next to every time.

## Timezone Detection

Use `Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser — no location permission needed, works everywhere `Intl` is supported (all targeted browsers). No manual override control in this iteration (YAGNI — add one later only if users actually ask to pin a different zone than their device's).

## Hydration Handling

`MatchCentreApp` is already a client component (`useState` already in use). The server has no way to know the viewer's timezone during SSR, so:

- Initial render (server and the first client paint, before mount) uses `UTC` for `shortDate`/`timeLabel`, matching what the server would have produced — this guarantees the server-rendered HTML and the first client render are byte-identical, so React does not log a hydration mismatch.
- After mount, a `useEffect` reads `Intl.DateTimeFormat().resolvedOptions().timeZone` once and stores it in state. The component re-renders with the detected zone. This causes one harmless re-render shortly after the page becomes interactive — not a hydration error, just a normal state-driven re-render, the same pattern this codebase already uses elsewhere for client-only data.
- `dateKey()` (day-pill grouping) is unaffected by this — it always uses `UTC`, server and client alike, so it never needs the post-mount swap.

## Components

- `apps/web/lib/timezone-display.js` (new) — pure, testable helpers:
  - `formatKickoffDate(kickoff, timeZone)` → short date string (`shortDate`'s logic, parameterized).
  - `formatKickoffTime(kickoff, timeZone)` → time + abbreviation string, e.g. `"6:00 PM KST"` (uses `timeZoneName: "short"` and assembles the final string).
  - `detectViewerTimeZone()` → wraps `Intl.DateTimeFormat().resolvedOptions().timeZone` so the call site is mockable in tests.
  - Pulled out of the component (currently inline functions in `match-centre-app.tsx`) so they're unit-testable with an injected timezone, the same pattern already used for `fixture-presentation.js` and `prediction-presentation.js` in this codebase.
- `match-centre-app.tsx` — modify `dateKey` to hardcode `UTC`; replace `shortDate`/`timeLabel` call sites with the new `formatKickoffDate`/`formatKickoffTime` helpers, passing a `viewerTimeZone` state value (initialized to `"UTC"`, updated once via `useEffect` + `detectViewerTimeZone()`).

## Testing

- Unit tests for `formatKickoffDate`/`formatKickoffTime` with injected fixed timezones (e.g. `Asia/Seoul`, `America/New_York`, `UTC`) against known kickoff timestamps — covers the actual formatting logic without depending on the test runner's own system timezone.
- A focused test confirming `dateKey`-equivalent grouping logic stays on `UTC` regardless of any viewer timezone input (i.e. the grouping helper takes no timezone parameter at all, by construction, so there's nothing to accidentally wire up wrong).
- No new browser/Playwright test required beyond the existing browser-verification step already used for other UI checkpoints in this project (manual `/browse` check after implementation, per this project's established verification pattern).

## Non-Goals

- No manual timezone override UI control.
- No change to `kickoff_at` storage, ingestion, or any backend/Supabase code.
- No change to the day-pill grouping behavior itself, only its anchor zone (Seoul → UTC).
