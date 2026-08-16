import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { createWorldGetHandler } from "../http.ts";
import { loadDisplayWorldProjection, loadMemberWorldProjection } from "../service.ts";

const appearance = JSON.stringify({ character: "marshmallow" });
const rows = [
  { id: "current", household_id: "household-a", member_id: "member-a", display_name: "Current", base_style_version: "homebase-pixel-v1", appearance_json: appearance, active_loadout_json: "{}", visibility: "private", status: "draft", deleted_at: null },
  { id: "partner-ready", household_id: "household-a", member_id: "member-b", display_name: "Partner", base_style_version: "homebase-pixel-v1", appearance_json: appearance, active_loadout_json: "{}", visibility: "household", status: "ready", deleted_at: null },
  { id: "partner-draft", household_id: "household-a", member_id: "member-c", display_name: "Draft secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, active_loadout_json: "{}", visibility: "household", status: "draft", deleted_at: null },
  { id: "partner-private", household_id: "household-a", member_id: "member-d", display_name: "Private secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, active_loadout_json: "{}", visibility: "private", status: "ready", deleted_at: null },
  { id: "other-house", household_id: "household-b", member_id: "member-z", display_name: "Other secret", base_style_version: "homebase-pixel-v1", appearance_json: appearance, active_loadout_json: "{}", visibility: "household", status: "ready", deleted_at: null },
];

function storedKey(loadout) {
  try {
    const parsed = JSON.parse(loadout);
    return parsed && !Array.isArray(parsed) && Object.keys(parsed).length === 1 && typeof parsed.emblem === "string" ? parsed.emblem : null;
  } catch { return null; }
}

function fakeDb(sourceRows, unlocks = [], completions = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async all() {
              const [, , householdId, currentMember] = values;
              const results = sourceRows
                .filter((row) => row.household_id === householdId && row.deleted_at === null)
                .filter((row) => row.member_id === currentMember || (row.status === "ready" && row.visibility === "household"))
                .sort((left, right) => Number(left.member_id !== currentMember) - Number(right.member_id !== currentMember) || left.id.localeCompare(right.id))
                .slice(0, 16)
                .map(({ id, household_id, member_id, display_name, base_style_version, appearance_json, active_loadout_json, visibility }) => {
                  const key = storedKey(active_loadout_json);
                  const verified = unlocks.find((unlock) => unlock.household_id === household_id && unlock.member_id === member_id
                    && unlock.persona_id === id && unlock.reward_key === key && unlock.catalog_version === 1 && unlock.policy_version === 1);
                  const completion = (completions ?? []).find((entry) => entry.member_id === member_id
                    && (member_id === currentMember || ["household", "display"].includes(entry.visibility)));
                  return {
                    id, member_id, display_name, base_style_version, appearance_json, visibility,
                    equipped_reward_key: verified?.reward_key ?? null,
                    last_completed_at: completion?.occurred_at ?? null,
                    last_family: completion?.family ?? null,
                  };
                });
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
  assert.ok(projection.personas.every((persona) => persona.activity === "rest"), "no visible completions means a resting companion");
  assert.ok(projection.personas.every((persona) => persona.equippedRewardKey === null));
  assert.deepEqual(projection.items, []);
  assert.deepEqual(projection.adventures, []);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /member-a|member-b|email|external|approved|Draft secret|Private secret|Other secret/);

  const call = db.calls[0];
  assert.equal(db.calls.length, 1, "world persona loadout verification remains a single D1 query");
  assert.deepEqual(call.values, ["member-a", "member-a", "household-a", "member-a", "member-a", "member-a"]);
  assert.match(call.sql, /p\.household_id = \?/);
  assert.match(call.sql, /p\.member_id = \? OR/);
  assert.match(call.sql, /p\.status = 'ready' AND p\.visibility = 'household'/);
  assert.match(call.sql, /LEFT JOIN persona_unlocks pu ON pu\.household_id = p\.household_id/);
  assert.match(call.sql, /pu\.member_id = p\.member_id AND pu\.persona_id = p\.id/);
  assert.match(call.sql, /json_valid\(p\.active_loadout_json\)/);
  assert.match(call.sql, /pu\.catalog_version = 1 AND pu\.policy_version = 1/);
  assert.match(call.sql, /ORDER BY CASE WHEN p\.member_id = \? THEN 0 ELSE 1 END ASC, p\.id ASC/);
  assert.match(call.sql, /LIMIT 16/);
  assert.doesNotMatch(call.sql, /SELECT \*|email|external_user|approved_at|created_at|updated_at|account|goal|transaction/i);
});

test("world projects only exact verified v1 equipped emblem joins", async () => {
  const loadoutRows = [
    { ...rows[0], active_loadout_json: JSON.stringify({ emblem: "first-tend" }) },
    { ...rows[1], active_loadout_json: JSON.stringify({ emblem: "first-connect" }) },
  ];
  const unlocks = [
    { household_id: "household-a", member_id: "member-a", persona_id: "current", reward_key: "first-tend", catalog_version: 1, policy_version: 1 },
    { household_id: "household-a", member_id: "member-b", persona_id: "partner-ready", reward_key: "first-connect", catalog_version: 1, policy_version: 1 },
  ];
  const projection = await loadMemberWorldProjection(context(fakeDb(loadoutRows, unlocks)), "2026-08-15T12:00:00.000Z");
  assert.deepEqual(projection.personas.map((persona) => persona.equippedRewardKey), ["first-tend", "first-connect"]);

  const forgedRows = [
    { ...rows[0], active_loadout_json: JSON.stringify({ emblem: "first-tend", extra: "SECRET" }) },
    { ...rows[1], active_loadout_json: JSON.stringify({ emblem: "unknown-reward" }) },
  ];
  const crossScope = [{ ...unlocks[0], household_id: "household-other" }];
  const stripped = await loadMemberWorldProjection(context(fakeDb(forgedRows, crossScope)), "2026-08-15T12:00:00.000Z");
  assert.deepEqual(stripped.personas.map((persona) => persona.equippedRewardKey), [null, null]);
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

test("a partner's companion reacts only to moves they made visible", async () => {
  const completions = [
    { member_id: "member-a", family: "grow", occurred_at: "2026-08-15T11:30:00.000Z", visibility: "private" },
    { member_id: "member-b", family: "tend", occurred_at: "2026-08-15T11:30:00.000Z", visibility: "private" },
  ];
  const hidden = await loadMemberWorldProjection(context(fakeDb(rows, [], completions)), "2026-08-15T12:00:00.000Z");
  const [own, partner] = hidden.personas;
  assert.equal(own.activity, "celebrate", "your own private move still moves your companion");
  assert.equal(partner.activity, "rest", "a partner's private move stays invisible");

  const shared = await loadMemberWorldProjection(
    context(fakeDb(rows, [], completions.map((entry) => ({ ...entry, visibility: "household" })))),
    "2026-08-15T12:00:00.000Z",
  );
  assert.equal(shared.personas[1].activity, "celebrate", "a shared move is allowed to show");
  assert.doesNotMatch(JSON.stringify(shared), /member-b|payload_json|occurred_at/);
});

function displayDb(sourceRows, celebrations = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async all() {
              const [householdId] = values;
              const results = sourceRows
                .filter((row) => row.household_id === householdId && row.deleted_at === null)
                .filter((row) => row.status === "ready" && row.visibility === "household")
                .sort((left, right) => left.id.localeCompare(right.id))
                .map(({ id, display_name, base_style_version, appearance_json, member_id }) => ({
                  id, display_name, base_style_version, appearance_json,
                  last_celebrated_at: celebrations.find((entry) => entry.member_id === member_id
                    && entry.visibility === "display")?.occurred_at ?? null,
                }));
              return { success: true, results, meta: {} };
            },
          };
        },
      };
    },
  };
}

test("the wall display shows only shared companions and never their activity", async () => {
  const db = displayDb(rows);
  const projection = await loadDisplayWorldProjection(context(db), "2026-08-15T12:00:00.000Z");

  // Own private persona, a partner's draft, a partner's private persona and
  // another household are all absent; only the ready household-shared one shows.
  assert.deepEqual(projection.personas.map((persona) => persona.id), ["partner-ready"]);
  assert.equal(projection.viewer, "display");
  assert.ok(projection.personas.every((persona) => persona.visibility === "display"));
  assert.ok(projection.personas.every((persona) => persona.activity === "idle"));
  assert.ok(projection.personas.every((persona) => persona.equippedRewardKey === null));

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /member-|email|external|Draft secret|Private secret|Other secret|Current/);

  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].values, ["household-a"]);
  assert.match(db.calls[0].sql, /p\.status = 'ready' AND p\.visibility = 'household'/);
  assert.match(db.calls[0].sql, /ge\.visibility = 'display'/);
});

test("a household-visible completion cannot reach the display", async () => {
  const household = [{ member_id: "member-b", visibility: "household", occurred_at: "2026-08-15T11:59:00.000Z" }];
  const quiet = await loadDisplayWorldProjection(context(displayDb(rows, household)), "2026-08-15T12:00:00.000Z");
  assert.equal(quiet.personas[0].activity, "idle", "only display-visible events may celebrate");

  const shown = [{ member_id: "member-b", visibility: "display", occurred_at: "2026-08-15T11:59:00.000Z" }];
  const celebrating = await loadDisplayWorldProjection(context(displayDb(rows, shown)), "2026-08-15T12:00:00.000Z");
  assert.equal(celebrating.personas[0].activity, "celebrate");
});
