import { createClient } from "@supabase/supabase-js";

export function createSupabaseWriter({ url, serviceRoleKey }) {
  if (!url) {
    throw new Error("SUPABASE_URL is required for ingestion writes");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for ingestion writes");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return {
    async applyLiveScorePlan(plan) {
      const fixtureResult = await client
        .from("fixtures")
        .update(plan.fixture)
        .eq("id", plan.fixture.id)
        .select("id")
        .single();

      if (fixtureResult.error) {
        throw fixtureResult.error;
      }

      if (plan.events.length > 0) {
        const eventResult = await client.from("match_events").upsert(plan.events, {
          onConflict: "source,source_event_id"
        });

        if (eventResult.error) {
          throw eventResult.error;
        }
      }

      return {
        fixtureId: plan.fixture.id,
        eventsChanged: plan.events.length
      };
    }
  };
}
