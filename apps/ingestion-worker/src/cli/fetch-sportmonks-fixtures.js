import { runFetchSportmonksFixtures } from "./fetch-sportmonks-fixtures-core.js";
import { createSportmonksClient } from "../provider/sportmonks-client.js";

const client = createSportmonksClient({
  token: process.env.SPORTMONKS_API_TOKEN
});

const result = await runFetchSportmonksFixtures({
  argv: process.argv.slice(2),
  cwd: process.env.INIT_CWD ?? process.cwd(),
  client
});

console.log(JSON.stringify(result, null, 2));
