import { parseDailyMove, parseMoveCompletionOptions, type DailyMoveV1 } from "@homebase/contracts";

import { dailyMoveFixtures } from "../fixtures/game";
import type { DailyMovesApi } from "./dailyMoves";

function cloneMove(move: DailyMoveV1, localDate = move.localDate) {
  return parseDailyMove({
    ...move,
    localDate,
    source: { ...move.source },
  });
}

export function createFixtureDailyMovesApi(
  fixtures: readonly DailyMoveV1[] = dailyMoveFixtures,
): DailyMovesApi {
  let moves = fixtures.map((move) => cloneMove(move));

  function update(moveId: string, updateMove: (move: DailyMoveV1) => DailyMoveV1) {
    const index = moves.findIndex((move) => move.id === moveId);
    const current = moves[index];
    if (index < 0 || !current) throw new Error("Preview move not found.");
    const updated = updateMove(current);
    moves[index] = updated;
    return cloneMove(updated);
  }

  return {
    async load(localDate) {
      moves = moves.map((move) => cloneMove(move, localDate));
      return moves.map((move) => cloneMove(move));
    },
    async complete(moveId) {
      const move = update(moveId, (current) => parseDailyMove({
        ...current,
        status: "complete",
        completedAt: new Date().toISOString(),
      }));
      return { move, event: null, balances: [] };
    },
    async defer(moveId) {
      return update(moveId, (move) => parseDailyMove({
        ...move,
        status: "deferred",
        completedAt: null,
      }));
    },
    async replace(moveId) {
      return update(moveId, (move) => parseDailyMove({
        ...move,
        family: "connect",
        source: { type: "household", id: `preview-replacement-${move.id}` },
        title: "Share one calm household check-in",
        shortLabel: "Check in together",
        selectionReasonCode: "cooperative",
      }));
    },
    async options(moveId) {
      const move = moves.find((candidate) => candidate.id === moveId);
      if (!move) throw new Error("Preview move not found.");
      if (move.source.type === "goal") {
        return parseMoveCompletionOptions({
          contractVersion: 1,
          moveId,
          kind: "goal",
          unitLabel: "progress units",
          defaultValue: 1,
        });
      }
      if (move.source.type === "transaction") {
        return parseMoveCompletionOptions({
          contractVersion: 1,
          moveId,
          kind: "transaction",
          categories: [{ id: "preview-category", name: "Preview category", ownership: "shared" }],
          createRuleDefault: false,
        });
      }
      return parseMoveCompletionOptions({ contractVersion: 1, moveId, kind: "none" });
    },
  };
}
