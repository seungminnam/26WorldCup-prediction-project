import { createClient } from "@supabase/supabase-js";
import { canonicalSchedule } from "../packages/tournament-engine/src/data/canonical-schedule.js";
import { createEspnClient } from "../apps/ingestion-worker/src/provider/espn-client.js";
import { compareFixedFixtureMetadata, normalizeEspnFixture } from "../apps/ingestion-worker/src/provider/espn.js";

const skipDatabase = process.argv.includes("--skip-db");
const events = await createEspnClient().fetchTournamentEvents();
const espnById = new Map(events.map((event) => [String(event.id), normalizeEspnFixture(event)]));
const espnDrift = canonicalSchedule.flatMap((fixture) => {
  const normalized = espnById.get(fixture.espnFixtureId);
  if (!normalized) return [{ fixtureId: fixture.id, field: "missing_espn_fixture" }];
  return compareFixedFixtureMetadata(normalized, fixture)
    .filter((item) => item.field !== "participants" || fixture.stage === "group")
    .map((item) => ({ fixtureId: fixture.id, ...item }));
});

let databaseDrift = [];
let databaseCount = null;
if (!skipDatabase) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase publishable environment is required; use --skip-db for provider-only audit");

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client
    .from("fixture_cards")
    .select(
      "id,match_number,group_code,stage,kickoff_at,venue_name,home_team_id,away_team_id,home_slot,away_slot"
    );
  if (error) throw error;
  databaseCount = data.length;
  const rowsById = new Map(data.map((row) => [row.id, row]));
  databaseDrift = canonicalSchedule.flatMap((fixture) => compareDatabaseFixture(rowsById.get(fixture.id), fixture));
}

const report = {
  canonicalCount: canonicalSchedule.length,
  espnCount: events.length,
  espnDriftCount: espnDrift.length,
  databaseCount,
  databaseDriftCount: databaseDrift.length,
  espnDrift,
  databaseDrift
};
console.log(JSON.stringify(report, null, 2));

if (espnDrift.length > 0 || databaseDrift.length > 0 || (!skipDatabase && databaseCount !== 104)) {
  process.exitCode = 1;
}

function compareDatabaseFixture(row, fixture) {
  if (!row) return [{ fixtureId: fixture.id, field: "missing_database_fixture" }];
  const checks = [
    ["match_number", row.match_number, fixture.matchNumber],
    ["stage", row.stage, fixture.stage],
    ["group_code", row.group_code, fixture.group],
    ["kickoff_at", new Date(row.kickoff_at).toISOString(), fixture.kickoff],
    ["venue_name", row.venue_name, fixture.stadium],
    ["home_team_id", row.home_team_id, fixture.homeTeamId],
    ["away_team_id", row.away_team_id, fixture.awayTeamId],
    ["home_slot", row.home_slot, fixture.homeSlot],
    ["away_slot", row.away_slot, fixture.awaySlot]
  ];
  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => ({ fixtureId: fixture.id, field, expected, actual }));
}
