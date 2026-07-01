import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { canonicalSchedule } from "@wc/tournament-engine";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { findLiveSyncWindow } from "@/lib/live-sync-window";
import {
  formatSyncErrorMessage,
  runSyncEspnLive
} from "../../../../../ingestion-worker/src/cli/sync-espn-live-core.js";
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
  const syncWindowMode = syncWindow.activeFixtureIds.length > 0
    ? "live_window"
    : "daily_reconciliation";

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
        error: formatSyncErrorMessage(error, "Unknown knockout resolution error")
      };
    }

    return NextResponse.json({
      ok: true,
      mode: "apply",
      syncWindowMode,
      checkedAt: now.toISOString(),
      activeFixtureIds: syncWindow.activeFixtureIds,
      nextWindow: syncWindow.nextWindow,
      result,
      knockoutResolution
    });
  } catch (error) {
    try {
      revalidatePath("/");
    } catch {
      // A failed sync may still have applied partial fixture updates before throwing.
    }

    return NextResponse.json(
      {
        ok: false,
        mode: "apply",
        syncWindowMode,
        checkedAt: now.toISOString(),
        activeFixtureIds: syncWindow.activeFixtureIds,
        nextWindow: syncWindow.nextWindow,
        error: formatSyncErrorMessage(error, "Unknown ESPN sync error")
      },
      { status: 500 }
    );
  }
}
