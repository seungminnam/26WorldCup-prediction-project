import { createEspnClient } from "../provider/espn-client.js";
import { runFetchEspnFixtures } from "./fetch-espn-fixtures-core.js";

const client = createEspnClient({});

const result = await runFetchEspnFixtures({ argv: process.argv.slice(2), client });
console.log(JSON.stringify(result, null, 2));
