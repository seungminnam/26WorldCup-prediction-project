import { createSupabaseWriter } from "../storage/supabase-writer.js";
import { runMappingImport } from "./import-mappings-core.js";

const result = await runMappingImport({
  argv: process.argv.slice(2),
  cwd: process.env.INIT_CWD ?? process.cwd(),
  createWriter() {
    return createSupabaseWriter({
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    });
  }
});

console.log(JSON.stringify(result, null, 2));
