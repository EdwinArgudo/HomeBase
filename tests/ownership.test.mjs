import assert from "node:assert/strict";
import test from "node:test";

import { mayBootstrapHousehold, parseConfiguredOwners } from "../lib/household/ownership.ts";

const deployed = { isLocalDevelopment: false };

test("an unconfigured Homebase cannot be claimed by anyone", () => {
  // The window is narrow — an empty database — but whoever arrives first would
  // otherwise own the household.
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "stranger@example.com", configuredOwners: undefined }), false);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "stranger@example.com", configuredOwners: "" }), false);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "stranger@example.com", configuredOwners: " , ," }), false);
});

test("only a named owner may claim it, however the address is written", () => {
  const configuredOwners = " Edwin@Example.com , partner@example.com ";
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "edwin@example.com", configuredOwners }), true);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "  EDWIN@EXAMPLE.COM ", configuredOwners }), true);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "partner@example.com", configuredOwners }), true);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "someone@example.com", configuredOwners }), false);
  // Not a prefix, a suffix, or anything but the whole address.
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "edwin@example.com.attacker.test", configuredOwners }), false);
  assert.equal(mayBootstrapHousehold({ ...deployed, email: "edwin@example.co", configuredOwners }), false);
});

test("local development claims its own throwaway database", () => {
  assert.equal(mayBootstrapHousehold({ email: "edwin@homebase.local", isLocalDevelopment: true, configuredOwners: undefined }), true);
});

test("the owner list ignores blanks and casing", () => {
  assert.deepEqual(parseConfiguredOwners("A@b.com,, C@d.com , "), ["a@b.com", "c@d.com"]);
  assert.deepEqual(parseConfiguredOwners(undefined), []);
});
