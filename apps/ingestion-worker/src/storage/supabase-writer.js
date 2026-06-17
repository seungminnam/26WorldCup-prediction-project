import { createClient } from "@supabase/supabase-js";

export function createSupabaseWriter({ url, serviceRoleKey, client: injectedClient } = {}) {
  const client = injectedClient ?? createServerClient({ url, serviceRoleKey });

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
    },

    async applyProviderMappingPlan(plan) {
      await upsertOrThrow(client, "data_providers", plan.provider, { onConflict: "id" });

      if (plan.teamMappings.length > 0) {
        await upsertOrThrow(client, "provider_team_mappings", plan.teamMappings, {
          onConflict: "provider_id,team_id"
        });
      }

      if (plan.fixtureMappings.length > 0) {
        await upsertOrThrow(client, "provider_fixture_mappings", plan.fixtureMappings, {
          onConflict: "provider_id,fixture_id"
        });
      }

      return {
        providerId: plan.provider.id,
        teamMappingsChanged: plan.teamMappings.length,
        fixtureMappingsChanged: plan.fixtureMappings.length
      };
    }
  };
}

function createServerClient({ url, serviceRoleKey }) {
  if (!url) {
    throw new Error("SUPABASE_URL is required for ingestion writes");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for ingestion writes");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function upsertOrThrow(client, table, rows, options) {
  const result = await client.from(table).upsert(rows, options);

  if (result.error) {
    throw result.error;
  }
}
