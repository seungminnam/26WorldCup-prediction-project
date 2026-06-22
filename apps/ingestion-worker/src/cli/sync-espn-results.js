import { canonicalSchedule } from "@wc/tournament-engine";
import { createEspnClient } from "../provider/espn-client.js";
import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { syncEspnResults } from "../sync/espn-results.js";

const writer = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});
const mappings = await writer.loadProviderMappings("espn");
const events = await createEspnClient().fetchTournamentEvents();
const result = await syncEspnResults({
  events,
  canonicalFixtures: canonicalSchedule,
  mappings,
  writer
});

console.log(JSON.stringify({ eventsSeen: events.length, ...result }, null, 2));

if (result.rejected.length > 0) process.exitCode = 1;
