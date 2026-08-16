import { parseDailyMove } from "@homebase/contracts";
import { describe, expect, it, vi } from "vitest";

import { dailyMoveFixtures } from "../fixtures/game";
import { createHttpDailyMovesApi } from "./dailyMoves";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("daily moves HTTP API", () => {
  it("uses the dated same-origin endpoint and parses every loaded move", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ moves: [dailyMoveFixtures[0]] }));
    const moves = await createHttpDailyMovesApi(fetcher).load("2026-08-15");

    expect(fetcher).toHaveBeenCalledWith("/api/game/moves?date=2026-08-15", { credentials: "same-origin" });
    expect(moves).toEqual([dailyMoveFixtures[0]]);

    fetcher.mockResolvedValueOnce(jsonResponse({ moves: [{ ...dailyMoveFixtures[0], slot: 9 }] }));
    await expect(createHttpDailyMovesApi(fetcher).load("2026-08-15"))
      .rejects.toThrow("could not be verified");
  });

  it("sends only the selected completion input and verifies the authoritative envelope", async () => {
    const completed = parseDailyMove({
      ...dailyMoveFixtures[0],
      status: "complete",
      completedAt: "2026-08-15T12:00:00.000Z",
    });
    const event = {
      contractVersion: 1,
      id: completed.id,
      householdId: completed.householdId,
      memberId: completed.memberId,
      eventType: "daily_move.completed",
      source: { type: "daily_move", id: completed.id },
      visibility: completed.visibility,
      payload: { version: 1, data: { family: "tend", ownership: "shared", personalPoints: 10, householdPoints: 4 } },
      idempotencyKey: `daily_move.completed:${completed.id}:v1`,
      occurredAt: completed.completedAt,
      createdAt: completed.completedAt,
    };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ move: completed, event, balances: [] }));
    const api = createHttpDailyMovesApi(fetcher);

    await expect(api.complete(completed.id, { categoryId: "category-a", createRule: false }))
      .resolves.toEqual(completed);
    const [path, init] = fetcher.mock.calls[0] ?? [];
    expect(path).toBe(`/api/game/moves/${completed.id}/complete`);
    expect(JSON.parse(String(init?.body))).toEqual({ categoryId: "category-a", createRule: false });
  });

  it("surfaces only a closed safe server error object", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Today’s replacement has already been used." }, 409))
      .mockResolvedValueOnce(jsonResponse({ error: "ARBITRARY_SECRET", detail: "storage" }, 500));
    const api = createHttpDailyMovesApi(fetcher);

    await expect(api.replace("move-a")).rejects.toThrow("Today’s replacement has already been used.");
    await expect(api.replace("move-a")).rejects.toThrow("Unable to replace the move.");
  });
});
