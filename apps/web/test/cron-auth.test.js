import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedCronRequest } from "../lib/cron-auth.ts";

const bearerPrefix = "Bearer";

test("authorizes the expected bearer token", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authorizationHeader: `${bearerPrefix} secret-value`,
      secret: "secret-value"
    }),
    true
  );
});

test("rejects missing route secrets and mismatched headers", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authorizationHeader: `${bearerPrefix} secret-value`,
      secret: ""
    }),
    false
  );
  assert.equal(
    isAuthorizedCronRequest({
      authorizationHeader: `${bearerPrefix} wrong`,
      secret: "secret-value"
    }),
    false
  );
});
