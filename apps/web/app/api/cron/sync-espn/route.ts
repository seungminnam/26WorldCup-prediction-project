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
