# Automated Knockout Slot Resolution Via The Existing ESPN Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real knockout-bracket slot resolution (PR #23's `resolveKnockoutSlots`) run automatically, by calling it from the existing ESPN live-sync cron route instead of requiring a manual CLI run.

**Architecture:** A single Supabase writer instance is created once in the route and reused for both the existing ESPN sync call and the new knockout-resolution call. The new call is wrapped in its own try/catch, separate from the existing ESPN-sync try/catch, so a knockout-resolution failure never masks an otherwise-successful ESPN sync response.

**Tech Stack:** Next.js 16 App Router route handler (TypeScript), reusing already-shipped `apps/ingestion-worker` modules.

## Global Constraints

- No new cron schedule, endpoint, or UI — only `apps/web/app/api/cron/sync-espn/route.ts` changes.
- A knockout-resolution failure must be reported as `knockoutResolution: { ok: false, error: <message> }` inside the normal `200` success response — it must never cause the route to return `500`, and must never be conflated with an ESPN-sync error.
- Resolution always runs with `apply: true` (no dry-run mode in the automated path) every time the route does ESPN-sync work, with no "did anything change" gating.
- The existing top-level `skip` response (outside any match window) and the existing `500` response for an actual `runSyncEspnLive` failure are both unchanged.

---

## File Structure

- Modify `apps/web/app/api/cron/sync-espn/route.ts` — the only file this plan touches.

---

### Task 1: Wire Knockout Resolution Into The Cron Route

**Files:**
- Modify: `apps/web/app/api/cron/sync-espn/route.ts`

**Interfaces:**
- Consumes: `resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply }) => Promise<{ mode, resolvedCount, plan }>` and `writer.loadAllFixturesAndTeams() => Promise<{ teamRows, fixtureRows }>` (both already shipped in `apps/ingestion-worker`, used unchanged).

This task has no automated test (the route has none today, and this change adds no new pure logic of its own — it only calls two already-tested functions). Verification is `npm run typecheck`/`npm run build` plus a careful manual read-through, both done below.

- [ ] **Step 1: Read the current exact file**

Read `apps/web/app/api/cron/sync-espn/route.ts` in full before editing — confirm it still matches this plan's assumed starting content (shown in Step 2's "before" block) before applying the diff, since this file may have been touched since this plan was written.

- [ ] **Step 2: Apply the edit**

Replace the file's full contents from:

```ts
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { canonicalSchedule } from "@wc/tournament-engine";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { findLiveSyncWindow } from "@/lib/live-sync-window";
import { runSyncEspnLive } from "../../../../../ingestion-worker/src/cli/sync-espn-live-core.js";
import { createEspnClient } from "../../../../../ingestion-worker/src/provider/espn-client.js";
import { createSupabaseWriter } from "../../../../../ingestion-worker/src/storage/supabase-writer.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: process.env.CRON_SECRET
    })
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const syncWindow = findLiveSyncWindow(canonicalSchedule, now);

  if (syncWindow.activeFixtureIds.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "skip",
      reason: "outside_match_window",
      checkedAt: now.toISOString(),
      nextWindow: syncWindow.nextWindow
    });
  }

  try {
    const result = await runSyncEspnLive({
      argv: ["--apply"],
      client: createEspnClient(),
      store: createSupabaseWriter({
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
      }),
      today: now
    });

    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      mode: "apply",
      checkedAt: now.toISOString(),
      activeFixtureIds: syncWindow.activeFixtureIds,
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "apply",
        checkedAt: now.toISOString(),
        activeFixtureIds: syncWindow.activeFixtureIds,
        error: error instanceof Error ? error.message : "Unknown ESPN sync error"
      },
      { status: 500 }
    );
  }
}
```

to:

```ts
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { canonicalSchedule } from "@wc/tournament-engine";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { findLiveSyncWindow } from "@/lib/live-sync-window";
import { runSyncEspnLive } from "../../../../../ingestion-worker/src/cli/sync-espn-live-core.js";
import { createEspnClient } from "../../../../../ingestion-worker/src/provider/espn-client.js";
import { createSupabaseWriter } from "../../../../../ingestion-worker/src/storage/supabase-writer.js";
import { resolveKnockoutSlots } from "../../../../../ingestion-worker/src/sync/resolve-knockout-slots.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: process.env.CRON_SECRET
    })
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const syncWindow = findLiveSyncWindow(canonicalSchedule, now);

  if (syncWindow.activeFixtureIds.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "skip",
      reason: "outside_match_window",
      checkedAt: now.toISOString(),
      nextWindow: syncWindow.nextWindow
    });
  }

  const writer = createSupabaseWriter({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  });

  try {
    const result = await runSyncEspnLive({
      argv: ["--apply"],
      client: createEspnClient(),
      store: writer,
      today: now
    });

    revalidatePath("/");

    let knockoutResolution: { ok: boolean; resolvedCount?: number; error?: string };
    try {
      const { teamRows, fixtureRows } = await writer.loadAllFixturesAndTeams();
      const resolution = await resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply: true });
      knockoutResolution = { ok: true, resolvedCount: resolution.resolvedCount };
    } catch (error) {
      knockoutResolution = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown knockout resolution error"
      };
    }

    return NextResponse.json({
      ok: true,
      mode: "apply",
      checkedAt: now.toISOString(),
      activeFixtureIds: syncWindow.activeFixtureIds,
      result,
      knockoutResolution
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "apply",
        checkedAt: now.toISOString(),
        activeFixtureIds: syncWindow.activeFixtureIds,
        error: error instanceof Error ? error.message : "Unknown ESPN sync error"
      },
      { status: 500 }
    );
  }
}
```

The only changes: one new import, `createSupabaseWriter(...)` lifted out of the inline `store:` argument into a named `writer` constant (created right after the `skip` check, before the `try`), `store: writer` replacing the old inline call, the new inner `try/catch` computing `knockoutResolution` right after `revalidatePath("/")`, and `knockoutResolution` added to the success response object. The outer `catch` block is completely untouched.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck --workspace apps/web
```
Expected: no errors. (`resolveKnockoutSlots` and `writer.loadAllFixturesAndTeams` are plain `.js` exports with no `.d.ts`, consistent with how `runSyncEspnLive`/`createSupabaseWriter` from the same `ingestion-worker` package are already consumed in this exact file today without type errors — this import follows the identical existing pattern.)

- [ ] **Step 4: Run the build**

```bash
npm run build --workspace apps/web
```
Expected: succeeds, including the `/api/cron/sync-espn` route compiling.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
npm run ingestion:test
```
Expected: both pass with the same counts as before this change (this task adds no new test files, since the route itself has none and the change doesn't modify any tested function's behavior).

- [ ] **Step 6: Manual verification (no automated test for this route)**

Read the final file once more and confirm by hand: an error thrown inside `writer.loadAllFixturesAndTeams()` or `resolveKnockoutSlots(...)` is caught by the **inner** `catch` (producing `knockoutResolution: { ok: false, ... }` inside the still-`200` success response) and never reaches the **outer** `catch` (which would incorrectly report it as `"Unknown ESPN sync error"` with a `500` status). Confirm the outer `catch`'s behavior for a genuine `runSyncEspnLive` failure is completely unchanged from before this diff.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/cron/sync-espn/route.ts
git commit -m "feat: resolve knockout slots automatically as part of the ESPN live-sync cron"
```

---

### Task 2: Final Verification

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
git push -u origin feat/knockout-cron-resolution
gh pr create --base main --head feat/knockout-cron-resolution --title "feat: resolve knockout slots automatically as part of the ESPN live-sync cron" --body "See docs/superpowers/specs/2026-06-28-knockout-cron-resolution-design.md for the design."
```

- [ ] **Step 3: Confirm CI passes**

```bash
gh pr checks
```
Expected: `Test, Build, And Scan` passes.

- [ ] **Step 4: Note for the user — manual deploy-time verification**

This plan cannot exercise the route against real Supabase credentials in this environment. After merging and deploying, the user should either wait for the next scheduled cron tick during an active match window, or manually hit the route once with the correct `Authorization` header to confirm `knockoutResolution` appears in the response as expected.
