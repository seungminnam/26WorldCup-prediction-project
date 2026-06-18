import { createEspnClient } from "../provider/espn-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { runSyncEspnLive } from "./sync-espn-live-core.js";

const client = createEspnClient({});
const store = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});

const result = await runSyncEspnLive({ argv: process.argv.slice(2), client, store });
console.log(JSON.stringify(result, null, 2));
