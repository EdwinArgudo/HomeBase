import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { createWorldGetHandler } from "../http.ts";
import { loadMemberWorldProjection } from "../service.ts";

const appearance = JSON.stringify({ skinPalette: "warm", hairStyle: "short", hairColor: "espresso", outfit: "mint", accent: "none" });
const rows = [
  { id: "current", household_id: "household-a", member_id: "member-a", display_name: "Current", base_style_version: "homebase-pixel-v1", appearance_json: appearance, visibility: "private", status: "draft", deleted_at: null },
  { id: "partner-ready", household_id: "household-a", member_id: "member-b", display_name: "Partner", base_style_version: "homebase-pixel-v1", appearance_json: appearance, visibility: "household", status: "ready", deleted_at: null },
  { id: "partner-draft", household_id: "household-a", member_id: "member-c", display_name: "Draft secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, visibility: "household", status: "draft", deleted_at: null },
  { id: "partner-private", household_id: "household-a", member_id: "member-d", display_name: "Private secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, visibility: "private", status: "ready", deleted_at: null },
  { id: "other-house", household_id: "household-b", member_id: "member-z", display_name: "Other secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, visibility: "household", status: "ready", deleted_at: null },
];

function fakeDb(sourceRows) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async all() {
              const [householdId, currentMember] = values;
              const results = sourceRows
                .filter((row) => row.household_id === householdId && row.deleted_at === null)
                .filter((row) => row.member_id === currentMember || (row.status === "ready" && row.visibility === "household"))
                .sort((left, right) => Number(left.member_id !== currentMember) - Number(right.member_id !== currentMember) || left.id.localeCompare(right.id))
                .slice(0, 16)
                .map(({ id, member_id, display_name, base_style_version, appearance_json, visibility }) => ({ id, member_id, display_name, base_style_version, appearance_json, visibility }));
              return { success: true, results, meta: {} };
            },
          };
        },
      };
    },
  };
}

function context(db) {
  return {
    identity: { externalId: "external-a", email: "a@example.com", displayName: "Current" },
    member: { id: "member-a", household_id: "household-a", external_user_id: "external-a", email: "a@example.com", display_name: "Current", role: "member", personal_detail_visibility: "private" },
    db,
  };
}

test("world projection includes own draft/private and only ready household partners", async () => {
  const db = fakeDb(rows);
  const projection = await loadMemberWorldProjection(context(db), "2026-08-15T12:00:00.000Z");
  assert.deepEqual(projection.personas.map((persona) => persona.id), ["current", "partner-ready"]);
  assert.deepEqual(projection.personas.map((persona) => [persona.x, persona.y]), [[28, 62], [70, 57]]);
  assert.ok(projection.personas.every((persona) => persona.activity === "idle"));
  assert.deepEqual(projection.items, []);
  assert.deepEqual(projection.adventures, []);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /member-a|member-b|email|external|approved|Draft secret|Private secret|Other secret/);

  const call = db.calls[0];
  assert.deepEqual(call.values, ["household-a", "member-a", "member-a", "member-a"]);
  assert.match(call.sql, /household_id = \?/);
  assert.match(call.sql, /member_id = \? OR/);
  assert.match(call.sql, /status = 'ready' AND visibility = 'household'/);
  assert.match(call.sql, /ORDER BY CASE WHEN member_id = \? THEN 0 ELSE 1 END ASC, id ASC/);
  assert.match(call.sql, /LIMIT 16/);
  assert.doesNotMatch(call.sql, /SELECT \*|email|external_user|approved_at|created_at|updated_at|account|goal|transaction/i);
});

test("a member without a persona receives a valid empty projection", async () => {
  const projection = await loadMemberWorldProjection(context(fakeDb([])), "2026-08-15T12:00:00.000Z");
  assert.deepEqual(projection.personas, []);
  assert.equal(projection.viewer, "member");
});

test("invalid stored appearance fails closed and HTTP hides its detail", async () => {
  const badRows = [{ ...rows[0], appearance_json: JSON.stringify({ ...JSON.parse(appearance), css: "D1_PRIVATE_STYLE" }) }];
  await assert.rejects(loadMemberWorldProjection(context(fakeDb(badRows)), "2026-08-15T12:00:00.000Z"));
  const handler = createWorldGetHandler({
    requireMember: async () => context(fakeDb([])),
    generatedAt: () => "2026-08-15T12:00:00.000Z",
    loadWorld: async () => { throw new Error("D1_PRIVATE_STYLE"); },
  });
  const response = await handler(new Request("https://homebase.test/api/world"));
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), { error: "Unable to load the household world." });
  assert.doesNotMatch(text, /D1_PRIVATE_STYLE/);
});

test("world HTTP resolves membership before storage and preserves safe HttpError only", async () => {
  const calls = [];
  const handler = createWorldGetHandler({
    requireMember: async () => { calls.push("identity"); return context({}); },
    generatedAt: () => "2026-08-15T12:00:00.000Z",
    loadWorld: async () => { calls.push("storage"); return { ok: true }; },
  });
  assert.equal((await handler(new Request("https://homebase.test/api/world"))).status, 200);
  assert.deepEqual(calls, ["identity", "storage"]);

  const denied = createWorldGetHandler({
    requireMember: async () => { throw new HttpError(403, "Household access is required."); },
    generatedAt: () => "2026-08-15T12:00:00.000Z",
  });
  const response = await denied(new Request("https://homebase.test/api/world"));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Household access is required." });
});
