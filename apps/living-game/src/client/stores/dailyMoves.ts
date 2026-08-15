import type { DailyMoveV1 } from "@homebase/contracts";
import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { dailyMoveFixtures } from "../fixtures/game";

function copyMove(move: DailyMoveV1): DailyMoveV1 {
  return { ...move, source: { ...move.source } };
}

export const useDailyMovesStore = defineStore("daily-moves", () => {
  const moves = ref<DailyMoveV1[]>(dailyMoveFixtures.map(copyMove));
  const remainingMoves = computed(() => moves.value.filter((move) => move.status === "active"));
  const completedCount = computed(() => moves.value.filter((move) => move.status === "complete").length);
  const recommendedMove = computed(() => remainingMoves.value[0] ?? null);

  function completeMove(moveId: string) {
    const index = moves.value.findIndex((move) => move.id === moveId && move.status === "active");
    if (index < 0) return;
    const current = moves.value[index];
    if (!current) return;
    moves.value[index] = {
      ...current,
      status: "complete",
      completedAt: new Date().toISOString(),
    };
  }

  return { moves, remainingMoves, completedCount, recommendedMove, completeMove };
});
