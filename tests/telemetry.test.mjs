import assert from "node:assert/strict";
import test from "node:test";

import { buildTelemetryRecord } from "../lib/observability/telemetry.ts";

test("telemetry reports durations and counts, never who or what was bought", () => {
  assert.deepEqual(
    buildTelemetryRecord("daily_moves.materialized", {
      durationMs: 12.345,
      candidates: 7,
      selected: 3,
      minimumMode: false,
    }),
    { telemetry: "daily_moves.materialized", durationMs: 12.35, candidates: 7, selected: 3, minimumMode: false },
  );

  // A log line travels further than a database row, so identity never rides on
  // one — not the household, not the member, not the purchase.
  assert.deepEqual(
    buildTelemetryRecord("daily_move.completed", {
      householdId: "household-a",
      memberId: "member-a",
      merchantName: "Costco",
      amountCents: 4200,
      accessToken: "secret",
      sourceId: "txn-1",
      family: "tend",
    }),
    { telemetry: "daily_move.completed", family: "tend" },
  );
});

test("free text cannot ride along in a telemetry field", () => {
  assert.deepEqual(
    buildTelemetryRecord("plaid.sync", {
      reason: "ITEM_LOGIN_REQUIRED",
      detail: "the user bought something very specific",
      accounts: 2,
    }),
    { telemetry: "plaid.sync", reason: "ITEM_LOGIN_REQUIRED", accounts: 2 },
  );
});
