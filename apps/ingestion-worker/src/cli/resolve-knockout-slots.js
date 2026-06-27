import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { resolveKnockoutSlots } from "../sync/resolve-knockout-slots.js";

const apply = process.argv.includes("--apply");
const writer = createSupabaseWriter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});
const { teamRows, fixtureRows } = await writer.loadAllFixturesAndTeams();
const result = await resolveKnockoutSlots({ teamRows, fixtureRows, writer, apply });

console.log(JSON.stringify(result, null, 2));
