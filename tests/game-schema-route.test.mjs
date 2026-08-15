import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { HttpError } from "../lib/auth/identity.ts";
import { createMovesGetHandler } from "../lib/game/http.ts";

test("generated daily-moves migration matches the durable snapshot boundary", async () => {
  const migration = await readFile(new URL("../drizzle/0006_small_archangel.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `daily_moves`/);
  for (const column of [
    "household_id", "member_id", "local_date", "slot", "family",
    "ownership_type", "visibility", "source_type", "source_id", "title",
    "short_label", "estimated_seconds", "status", "selection_reason_code",
    "move_policy_version", "completed_at", "created_at",
  ]) assert.match(migration, new RegExp("`" + column + "`"));
  assert.match(migration, /CREATE UNIQUE INDEX `idx_daily_moves_member_date_slot`[^;]+`member_id`,`local_date`,`slot`/);
  assert.match(migration, /CREATE INDEX `idx_daily_moves_household_member_date_status`[^;]+`household_id`,`member_id`,`local_date`,`status`/);
  assert.match(migration, /daily_moves_slot_check/);
  assert.match(migration, /daily_moves_estimated_seconds_check/);
});

test("database readiness covers the generated daily-move schema", async () => {
  const readiness = await readFile(new URL("../db/readiness.ts", import.meta.url), "utf8");
  assert.match(readiness, /LEFT JOIN daily_moves dm ON 0/);
  assert.match(readiness, /dm\.selection_reason_code/);
  assert.match(readiness, /dm\.move_policy_version/);
});

test("generated action-loop migration has canonical events and partial progress uniqueness", async () => {
  const migration = await readFile(new URL("../drizzle/0007_faithful_mockingbird.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `game_events`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_game_events_idempotency_key`/);
  assert.match(migration, /CREATE INDEX `idx_game_events_household_occurred`/);
  assert.match(migration, /CREATE INDEX `idx_game_events_member_occurred`/);
  assert.match(migration, /CREATE TABLE `progress_balances`/);
  assert.match(migration, /idx_progress_balances_personal_dimension[^;]+WHERE .*member_id.* IS NOT NULL/);
  assert.match(migration, /idx_progress_balances_household_dimension[^;]+WHERE .*member_id.* IS NULL/);
  assert.match(migration, /progress_balances_points_check/);
  assert.match(migration, /daily_moves_replacement_count_check/);
  assert.match(migration, /SELECT [^;]+ 0, "created_at" FROM `daily_moves`/);

  const readiness = await readFile(new URL("../db/readiness.ts", import.meta.url), "utf8");
  assert.match(readiness, /dm\.replacement_count/);
  assert.match(readiness, /LEFT JOIN game_events ge ON 0/);
  assert.match(readiness, /LEFT JOIN progress_balances pb ON 0/);
});

test("moves HTTP boundary validates dates before membership storage", async () => {
  let membershipCalls = 0;
  const handler = createMovesGetHandler({
    requireMember: async () => {
      membershipCalls += 1;
      throw new Error("must not run");
    },
    candidateProvider: async () => [],
    createdAt: () => "2026-08-16T10:00:00.000Z",
    createId: () => "move-unused",
  });

  const response = await handler(new Request("https://homebase.example/api/game/moves?date=2026-02-31"));
  assert.equal(response.status, 400);
  assert.equal(membershipCalls, 0);
});

test("moves HTTP boundary preserves safe authentication errors", async () => {
  const handler = createMovesGetHandler({
    requireMember: async () => { throw new HttpError(401, "Sign in to continue."); },
    candidateProvider: async () => { throw new Error("must not run"); },
    createdAt: () => "2026-08-16T10:00:00.000Z",
    createId: () => "move-unused",
  });

  const response = await handler(new Request("https://homebase.example/api/game/moves?date=2026-08-16"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in to continue." });
});

test("moves HTTP boundary never exposes internal storage details", async () => {
  const secret = "D1_SQL_SECRET_table=daily_moves";
  const handler = createMovesGetHandler({
    requireMember: async () => { throw new Error(secret); },
    candidateProvider: async () => { throw new Error("must not run"); },
    createdAt: () => "2026-08-16T10:00:00.000Z",
    createId: () => "move-unused",
  });

  const response = await handler(new Request("https://homebase.example/api/game/moves?date=2026-08-16"));
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(body), { error: "Unable to load daily moves." });
  assert.doesNotMatch(body, new RegExp(secret));
});

test("moves route wires authenticated domain candidates without fixtures or an empty provider", async () => {
  const route = await readFile(new URL("../app/api/game/moves/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireMember:\s*requireHouseholdMember/);
  assert.match(route, /candidateProvider:\s*loadAuthorizedMoveCandidates/);
  assert.match(route, /minimumModeProvider:\s*loadHouseholdMinimumMode/);
  assert.doesNotMatch(route, /emptyCandidateProvider/);
  assert.doesNotMatch(route, /from\s+["'][^"']*fixtures/i);
});

test("daily-move action routes remain thin authenticated handlers", async () => {
  for (const action of ["complete", "defer", "replace"]) {
    const route = await readFile(new URL(`../app/api/game/moves/[id]/${action}/route.ts`, import.meta.url), "utf8");
    assert.match(route, /requireMember:\s*requireHouseholdMember/);
    assert.match(route, /dynamic = "force-dynamic"/);
    assert.doesNotMatch(route, /fixture|demo/i);
  }
});
