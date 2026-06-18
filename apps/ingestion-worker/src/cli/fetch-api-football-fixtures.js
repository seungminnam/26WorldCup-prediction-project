import {
  parseFetchApiFootballFixturesArgs,
  runFetchApiFootballFixtures
} from "./fetch-api-football-fixtures-core.js";
import { createApiFootballClient } from "../provider/api-football-client.js";

const argv = process.argv.slice(2);
parseFetchApiFootballFixturesArgs(argv);

const client = createApiFootballClient({
  apiKey: process.env.API_FOOTBALL_API_KEY
});

const result = await runFetchApiFootballFixtures({
  argv,
  cwd: process.env.INIT_CWD ?? process.cwd(),
  client
});

console.log(JSON.stringify(result, null, 2));
