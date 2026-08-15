import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useDailyMovesStore } from "./dailyMoves";

describe("daily moves store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("completes an active move exactly once and updates the shortlist", () => {
    const store = useDailyMovesStore();
    const moveId = store.remainingMoves[0]?.id;

    expect(store.moves.length).toBeLessThanOrEqual(3);
    expect(moveId).toBeTruthy();
    expect(store.remainingMoves).toHaveLength(2);
    expect(store.completedCount).toBe(1);

    store.completeMove(moveId!);

    const completedMove = store.moves.find((move) => move.id === moveId);
    expect(completedMove?.status).toBe("complete");
    expect(completedMove?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(store.remainingMoves).toHaveLength(1);
    expect(store.completedCount).toBe(2);

    const completedAt = completedMove?.completedAt;
    store.completeMove(moveId!);
    expect(store.moves.find((move) => move.id === moveId)?.completedAt).toBe(completedAt);
  });

  it("ignores an unknown move id", () => {
    const store = useDailyMovesStore();
    const original = store.moves.map((move) => ({ ...move }));

    store.completeMove("move-from-another-household");

    expect(store.moves).toEqual(original);
  });
});
