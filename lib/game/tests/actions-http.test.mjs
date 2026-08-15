import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../auth/identity.ts";
import {
  createMoveCompleteHandler,
  createMoveDeferHandler,
  createMoveReplaceHandler,
} from "../actions-http.ts";

const memberContext = {
  identity: { externalId: "external-a", email: "a@example.com", displayName: "Member A" },
  member: {
    id: "member-a",
    household_id: "household-a",
    external_user_id: "external-a",
    email: "a@example.com",
    display_name: "Member A",
    role: "member",
    personal_detail_visibility: "private",
  },
  db: {},
};

function request(body = "{}") {
  return new Request("https://homebase.test/api/game/moves/move-a/complete", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

test("action handlers never expose unexpected internal errors", async () => {
  const handlers = [
    createMoveCompleteHandler({
      requireMember: async () => memberContext,
      occurredAt: () => "2026-08-16T12:00:00.000Z",
      createId: () => "generated-a",
      complete: async () => { throw new Error("D1_SECRET_COMPLETE_FAILURE"); },
    }),
    createMoveDeferHandler({
      requireMember: async () => memberContext,
      defer: async () => { throw new Error("D1_SECRET_DEFER_FAILURE"); },
    }),
    createMoveReplaceHandler({
      requireMember: async () => memberContext,
      occurredAt: () => "2026-08-16T12:00:00.000Z",
      candidateProvider: async () => [],
      replace: async () => { throw new Error("D1_SECRET_REPLACE_FAILURE"); },
    }),
  ];

  for (const handler of handlers) {
    const response = await handler(request(), { params: { id: "move-a" } });
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.doesNotMatch(text, /D1_SECRET/);
  }
});

test("explicit HTTP errors preserve their safe status and message", async () => {
  const handler = createMoveCompleteHandler({
    requireMember: async () => memberContext,
    occurredAt: () => "2026-08-16T12:00:00.000Z",
    createId: () => "generated-a",
    complete: async () => { throw new HttpError(409, "Repair this source first."); },
  });

  const response = await handler(request(), { params: Promise.resolve({ id: "move-a" }) });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Repair this source first." });
});

test("completion resolves authenticated context before invoking storage service", async () => {
  const calls = [];
  const handler = createMoveCompleteHandler({
    requireMember: async () => {
      calls.push("identity");
      return memberContext;
    },
    occurredAt: () => "2026-08-16T12:00:00.000Z",
    createId: () => "generated-a",
    complete: async (context, moveId, body) => {
      calls.push("complete");
      assert.equal(context, memberContext);
      assert.equal(moveId, "move-a");
      assert.deepEqual(body, { value: 2 });
      return { move: { id: moveId }, event: null, balances: [] };
    },
  });

  const response = await handler(request('{"value":2}'), { params: { id: "move-a" } });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["identity", "complete"]);
});
