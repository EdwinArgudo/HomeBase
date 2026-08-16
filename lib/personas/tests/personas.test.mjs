import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { createApprovePersonaHandler, createCurrentPersonaHandlers } from "../http.ts";
import { approveCurrentPersona, loadCurrentPersonaSnapshot, saveManualPersona } from "../service.ts";

const timestamp = "2026-08-15T12:00:00.000Z";
const input = {
  contractVersion: 1,
  displayName: "Edwin",
  visibility: "private",
  appearance: { species: "marshmallow", palette: "cream", pattern: "plain", accessory: "none" },
};

function member(id = "member-a", household = "household-a") {
  return { id, household_id: household, external_user_id: `external-${id}`, email: `${id}@example.com`, display_name: id, role: "member", personal_detail_visibility: "private" };
}

function context(db, id = "member-a", household = "household-a") {
  return { identity: { externalId: `external-${id}`, email: `${id}@example.com`, displayName: id }, member: member(id, household), db };
}

class FakeDb {
  persona = null;
  events = new Map();
  calls = [];

  prepare(sql) {
    return {
      bind: (...values) => {
        this.calls.push({ sql, values });
        return {
          first: async () => this.#first(sql, values),
          run: async () => this.#run(sql, values),
        };
      },
    };
  }

  async batch(statements) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }

  #first(sql, values) {
    if (sql.includes("FROM personas")) {
      const [householdId, memberId] = values;
      return this.persona?.household_id === householdId && this.persona?.member_id === memberId ? structuredClone(this.persona) : null;
    }
    if (sql.includes("FROM game_events")) {
      const [, , , key] = values;
      return structuredClone(this.events.get(key) ?? null);
    }
    return null;
  }

  #run(sql, values) {
    if (sql.includes("INSERT OR IGNORE INTO personas")) {
      if (!this.persona) {
        const [id, householdId, memberId, displayName, baseStyle, appearanceJson, visibility, createdAt, updatedAt] = values;
        this.persona = { id, household_id: householdId, member_id: memberId, display_name: displayName, creation_method: "manual", status: "draft", base_style_version: baseStyle, appearance_json: appearanceJson, visibility, approved_at: null, created_at: createdAt, updated_at: updatedAt };
      }
    } else if (sql.includes("UPDATE personas") && sql.includes("SET display_name")) {
      const [displayName, appearanceJson, visibility, updatedAt, householdId, memberId] = values;
      if (this.persona?.household_id === householdId && this.persona?.member_id === memberId && (this.persona.status === "draft" || this.persona.visibility === visibility)) Object.assign(this.persona, { display_name: displayName, appearance_json: appearanceJson, visibility, updated_at: updatedAt });
    } else if (sql.includes("UPDATE personas") && sql.includes("status = 'ready'")) {
      const [approvedAt, updatedAt, id, householdId, memberId] = values;
      if (this.persona?.id === id && this.persona?.household_id === householdId && this.persona?.member_id === memberId && this.persona.status === "draft") Object.assign(this.persona, { status: "ready", approved_at: approvedAt, updated_at: updatedAt });
    } else if (sql.includes("INSERT OR IGNORE INTO game_events")) {
      const [id, payloadJson, key, occurredAt, createdAt, personaId, householdId, memberId] = values;
      if (!this.events.has(key) && this.persona?.id === personaId && this.persona?.household_id === householdId && this.persona?.member_id === memberId) {
        this.events.set(key, { id, household_id: householdId, member_id: memberId, event_type: "persona.approved", source_type: "persona", source_id: personaId, visibility: this.persona.visibility, payload_version: 1, payload_json: payloadJson, idempotency_key: key, occurred_at: occurredAt, created_at: createdAt });
      }
    }
    return { success: true };
  }
}

test("manual save and read stay scoped to the exact household member", async () => {
  const db = new FakeDb();
  const saved = await saveManualPersona(context(db), input, { createId: () => "persona-a", updatedAt: timestamp });
  assert.equal(saved.status, "draft");
  assert.deepEqual(saved.appearance, input.appearance);
  assert.equal((await loadCurrentPersonaSnapshot(context(db), timestamp)).persona.id, "persona-a");
  assert.equal((await loadCurrentPersonaSnapshot(context(db, "member-b"), timestamp)).persona, null);
  assert.ok(db.calls.filter((call) => call.sql.includes("FROM personas")).every((call) => call.sql.includes("household_id = ?") && call.sql.includes("member_id = ?")));
  assert.ok(db.calls.every((call) => !/SELECT \*/i.test(call.sql)));
});

test("editing a ready persona preserves its approval and immutable event visibility", async () => {
  const db = new FakeDb();
  await saveManualPersona(context(db), input, { createId: () => "persona-a", updatedAt: timestamp });
  await approveCurrentPersona(context(db), timestamp);
  const edited = await saveManualPersona(context(db), { ...input, displayName: "New name" }, { createId: () => "persona-unused", updatedAt: "2026-08-15T13:00:00.000Z" });
  assert.equal(edited.id, "persona-a");
  assert.equal(edited.status, "ready");
  assert.equal(edited.approvedAt, timestamp);
  await assert.rejects(
    saveManualPersona(context(db), { ...input, visibility: "household" }, { createId: () => "unused", updatedAt: "2026-08-15T14:00:00.000Z" }),
    (error) => error instanceof HttpError && error.status === 409,
  );
  const repeated = await approveCurrentPersona(context(db), "2026-08-15T15:00:00.000Z");
  assert.equal(repeated.event.visibility, "private");
  assert.equal(db.events.size, 1);
  assert.match(db.calls.find((call) => call.sql.includes("SET display_name"))?.sql ?? "", /status = 'draft' OR visibility = \?/);
});

test("duplicate approval converges on one canonical event and awards no progress", async () => {
  const db = new FakeDb();
  await saveManualPersona(context(db), { ...input, visibility: "household" }, { createId: () => "persona-a", updatedAt: timestamp });
  const first = await approveCurrentPersona(context(db), timestamp);
  const second = await approveCurrentPersona(context(db), "2026-08-15T13:00:00.000Z");
  assert.equal(first.event.id, second.event.id);
  assert.equal(first.event.id, "persona-approved:persona-a");
  assert.equal(db.events.size, 1);
  assert.equal(second.persona.status, "ready");
  assert.equal(second.persona.approvedAt, first.persona.approvedAt);
  assert.equal(second.persona.updatedAt, first.persona.updatedAt);
  assert.equal(second.event.visibility, "household");
  assert.deepEqual(second.event.payload.data, { personaId: "persona-a" });
  assert.ok(db.calls.every((call) => !/progress_balances|lifetime_points/i.test(call.sql)));
});

test("persona HTTP authenticates before services and hides internal failures", async () => {
  const calls = [];
  const handlers = createCurrentPersonaHandlers({
    requireMember: async () => { calls.push("identity"); return context({}); },
    now: () => timestamp,
    createId: () => "persona-a",
    load: async () => { calls.push("storage"); throw new Error("D1_PERSONA_SECRET"); },
  });
  const failed = await handlers.GET(new Request("https://homebase.test/api/personas/current"));
  const text = await failed.text();
  assert.deepEqual(calls, ["identity", "storage"]);
  assert.equal(failed.status, 500);
  assert.doesNotMatch(text, /D1_PERSONA_SECRET/);

  const approve = createApprovePersonaHandler({
    requireMember: async () => { throw new HttpError(401, "Sign in to continue."); },
    now: () => timestamp,
    createId: () => "unused",
  });
  const denied = await approve(new Request("https://homebase.test/api/personas/current/approve", { method: "POST" }));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: "Sign in to continue." });
});
