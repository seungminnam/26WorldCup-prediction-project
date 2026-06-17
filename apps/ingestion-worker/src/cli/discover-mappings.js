import { runDiscoverMappings } from "./discover-mappings-core.js";

const result = await runDiscoverMappings({
  argv: process.argv.slice(2),
  cwd: process.env.INIT_CWD ?? process.cwd()
});

console.log(JSON.stringify(result, null, 2));
