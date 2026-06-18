import { createFootballDataClient } from "../provider/football-data-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { runCompareFootballData } from "./compare-football-data-core.js";

const client = createFootballDataClient({ apiToken: process.env.FOOTBALL_DATA_API_TOKEN });
const store = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});

const diff = await runCompareFootballData({ argv: process.argv.slice(2), client, store });
console.log(JSON.stringify(diff, null, 2));
