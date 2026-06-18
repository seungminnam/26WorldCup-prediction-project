import { runSyncApiFootballLive } from "./sync-api-football-live-core.js";
import { createApiFootballClient } from "../provider/api-football-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";

const result = await runSyncApiFootballLive({
  argv: process.argv.slice(2),
  client: createApiFootballClient({
    apiKey: process.env.API_FOOTBALL_API_KEY
  }),
  store: createSupabaseWriter({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  })
});

console.log(JSON.stringify(result, null, 2));
