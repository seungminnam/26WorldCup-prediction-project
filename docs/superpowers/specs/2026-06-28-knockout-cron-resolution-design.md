# Automated Knockout Slot Resolution Via The Existing ESPN Cron

## Goal

Currently, resolving real knockout bracket slots (PR #23) requires someone to manually run a CLI script with real Supabase credentials. As the tournament progresses, this needs to happen automatically, without anyone having to remember to run it.

## Decision

Hook knockout-slot resolution into the *existing* ESPN live-sync cron route (`apps/web/app/api/cron/sync-espn/route.ts`) rather than introducing a new cron schedule, endpoint, or UI button. That route already runs periodically and is gated by `findLiveSyncWindow` (only does anything when a match is currently live or finished within the last 3 hours) — exactly the moments when a new knockout slot could plausibly become resolvable. `resolveKnockoutSlots` is cheap and idempotent (it only ever fills in currently-`null` slots), so there is no cost to attempting it on every tick where the route is already doing work; no extra "did anything actually change" gating is needed.

**Flow inside the route's existing `try` block** (after the existing `runSyncEspnLive` call succeeds):
1. Reuse the same `createSupabaseWriter(...)` instance already created for the ESPN sync (refactored into a local `writer` variable used by both calls, instead of being constructed inline only for `runSyncEspnLive`).
2. Call `writer.loadAllFixturesAndTeams()` then `resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply: true })`, wrapped in its own `try/catch` separate from the outer one.
3. On success, include `knockoutResolution: { ok: true, resolvedCount: result.resolvedCount }` in the JSON response.
4. On failure, include `knockoutResolution: { ok: false, error: <message> }` in the JSON response — but still return the normal `200` success response for the ESPN sync part, since the ESPN sync itself already succeeded by this point. A knockout-resolution failure must never be reported as an ESPN sync failure, and must never cause an otherwise-successful ESPN sync response to come back as a 500.

**Unaffected:** the route's existing top-level `skip` branch (outside any match window), its existing 500 response for an `runSyncEspnLive` failure, `revalidatePath("/")`, and the manual CLI script from PR #23 (still useful for ad-hoc/backfill runs, e.g. immediately after deploying this change, or for re-running by hand if someone wants to check without waiting for the next cron tick).

## Components

- `apps/web/app/api/cron/sync-espn/route.ts`: the only file that changes. Adds one new import (`resolveKnockoutSlots` from the ingestion-worker's sync module, alongside the existing relative imports of `runSyncEspnLive`/`createEspnClient`/`createSupabaseWriter` from `../../../../../ingestion-worker/src/...`), refactors `createSupabaseWriter(...)` into a named `writer` variable, and adds the new try/catch block plus the `knockoutResolution` response field.

## Testing

This route currently has no dedicated test file (confirmed: no `route.test.ts` exists for it in the repo). Following the same boundary the rest of this codebase already uses — testable logic lives in plain functions, thin route handlers wire them together untested — this change doesn't introduce new pure logic of its own (it only calls two already-tested functions, `resolveKnockoutSlots` and the existing `runSyncEspnLive`), so no new automated test is added for the route itself. Verification is: `npm run typecheck --workspace apps/web` and `npm run build --workspace apps/web` both pass, and a manual read-through confirming the try/catch nesting matches the spec (an error thrown inside the inner try is caught by the inner catch, not the outer one).

## Non-Goals

- No new cron schedule, endpoint, or admin UI button — reuses the existing ESPN cron entirely.
- No change to the manual CLI script's behavior (PR #23) — it remains available for ad-hoc runs.
- No "only resolve if something changed" optimization — the function's own idempotency already makes repeated no-op calls cheap and correct.
- No retry/backoff logic for a failed resolution attempt beyond "try again on the next cron tick" — since the route is already invoked periodically during match windows, a transient failure self-heals on the next tick without any special-cased retry code.
