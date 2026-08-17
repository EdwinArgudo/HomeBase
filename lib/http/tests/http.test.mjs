import assert from "node:assert/strict";
import { test } from "node:test";

import { HttpError } from "../../auth/identity.ts";
import { errorResponse, readJsonBody, requireRouteId } from "../index.ts";

function jsonRequest(body) {
  return new Request("https://homebase.test/api/thing", { method: "POST", body });
}

test("an HttpError answers with its own status and message", async () => {
  const response = errorResponse(new HttpError(403, "That is not yours."), "Something went wrong.");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "That is not yours." });
});

test("an unexpected failure answers 500 without leaking its message", async () => {
  const response = errorResponse(new Error("D1_ERROR: no such column: secret_token"), "Unable to load that.");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to load that." });
});

test("a body over the limit is rejected before it is parsed", async () => {
  const request = jsonRequest(JSON.stringify({ note: "x".repeat(2_000) }));
  await assert.rejects(
    readJsonBody(request, { limit: 1_024, tooLarge: "Too large.", invalid: "Invalid." }),
    (error) => error instanceof HttpError && error.status === 400 && error.message === "Too large.",
  );
});

test("a body that is not JSON is invalid", async () => {
  await assert.rejects(
    readJsonBody(jsonRequest("{not json"), { limit: 1_024, tooLarge: "Too large.", invalid: "Invalid." }),
    (error) => error instanceof HttpError && error.message === "Invalid.",
  );
});

test("a parser that rejects the value makes the body invalid", async () => {
  await assert.rejects(
    readJsonBody(jsonRequest('{"kind":"unknown"}'), {
      limit: 1_024,
      tooLarge: "Too large.",
      invalid: "Invalid.",
      parse: () => { throw new Error("unrecognised action"); },
    }),
    (error) => error instanceof HttpError && error.message === "Invalid.",
  );
});

test("a parser that accepts the value narrows the result", async () => {
  const body = await readJsonBody(jsonRequest('{"kind":"add"}'), {
    limit: 1_024,
    tooLarge: "Too large.",
    invalid: "Invalid.",
    parse: (value) => value,
  });
  assert.deepEqual(body, { kind: "add" });
});

test("an empty body is invalid unless the caller supplies a fallback", async () => {
  await assert.rejects(
    readJsonBody(jsonRequest(""), { limit: 1_024, tooLarge: "Too large.", invalid: "Invalid." }),
    (error) => error instanceof HttpError && error.message === "Invalid.",
  );

  assert.deepEqual(
    await readJsonBody(jsonRequest("  "), {
      limit: 1_024,
      tooLarge: "Too large.",
      invalid: "Invalid.",
      whenEmpty: () => ({}),
    }),
    {},
  );
});

test("a route id must be present and bounded", async () => {
  assert.equal(await requireRouteId({ id: "move_1" }, "Bad id."), "move_1");
  assert.equal(await requireRouteId(Promise.resolve({ id: "move_2" }), "Bad id."), "move_2");

  for (const params of [{ id: "" }, { id: "x".repeat(129) }]) {
    await assert.rejects(
      requireRouteId(params, "Bad id."),
      (error) => error instanceof HttpError && error.status === 400 && error.message === "Bad id.",
    );
  }
});
