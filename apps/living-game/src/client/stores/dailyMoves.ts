import type { DailyMoveV1, MoveCompletionOptionsV1 } from "@homebase/contracts";
import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";

import type { CompleteMoveInput, DailyMovesApi } from "../api/dailyMoves";

type DailyMovesRuntime = {
  api: DailyMovesApi;
  now: () => Date;
};

let runtime: DailyMovesRuntime | null = null;

export function configureDailyMovesRuntime(configuration: DailyMovesRuntime) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Daily moves runtime has not been configured.");
  return runtime;
}

export function localCalendarDate(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : fallback;
}

export const useDailyMovesStore = defineStore("daily-moves", () => {
  const moves = ref<DailyMoveV1[]>([]);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const loadedDate = ref<string | null>(null);
  const feedback = ref("");
  const busyMoveIds = reactive(new Set<string>());
  const actionErrors = reactive(new Map<string, string>());
  const optionStates = reactive(new Map<string, "loading" | "ready" | "error">());
  const optionErrors = reactive(new Map<string, string>());
  const options = reactive(new Map<string, MoveCompletionOptionsV1>());
  let loadSequence = 0;
  let pendingLoad: Promise<void> | null = null;
  let pendingDate: string | null = null;
  const pendingOptions = new Map<string, Promise<void>>();

  const remainingMoves = computed(() => moves.value.filter((move) => move.status === "active"));
  const completedCount = computed(() => moves.value.filter((move) => move.status === "complete").length);
  const recommendedMove = computed(() => remainingMoves.value[0] ?? null);

  async function ensureLoaded(force = false) {
    const currentRuntime = configuredRuntime();
    const date = localCalendarDate(currentRuntime.now());
    if (!force && loadState.value === "ready" && loadedDate.value === date) return;
    if (!force && pendingLoad && pendingDate === date) return pendingLoad;
    const sequence = ++loadSequence;
    pendingDate = date;
    loadState.value = "loading";
    loadError.value = "";
    const request = currentRuntime.api.load(date).then((loaded) => {
      if (sequence !== loadSequence) return;
      moves.value = loaded;
      loadedDate.value = date;
      loadState.value = "ready";
    }).catch((error: unknown) => {
      if (sequence !== loadSequence) return;
      moves.value = [];
      loadedDate.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error, "Unable to load today’s moves.");
    }).finally(() => {
      if (sequence === loadSequence) {
        pendingLoad = null;
        pendingDate = null;
      }
    });
    pendingLoad = request;
    return request;
  }

  function updateAuthoritativeMove(move: DailyMoveV1) {
    const index = moves.value.findIndex((current) => current.id === move.id);
    if (index < 0) return;
    const current = moves.value[index];
    if (current && (current.source.type !== move.source.type || current.source.id !== move.source.id)) {
      options.delete(move.id);
      optionStates.delete(move.id);
      optionErrors.delete(move.id);
      pendingOptions.delete(move.id);
    }
    moves.value[index] = move;
  }

  async function runAction(moveId: string, action: () => Promise<DailyMoveV1>, success: string) {
    if (busyMoveIds.has(moveId)) return;
    busyMoveIds.add(moveId);
    actionErrors.delete(moveId);
    feedback.value = "";
    try {
      updateAuthoritativeMove(await action());
      feedback.value = success;
    } catch (error) {
      actionErrors.set(moveId, safeMessage(error, "That move could not be updated."));
    } finally {
      busyMoveIds.delete(moveId);
    }
  }

  function completeMove(moveId: string, input: CompleteMoveInput) {
    return runAction(moveId, () => configuredRuntime().api.complete(moveId, input), "Move completed.");
  }

  function deferMove(moveId: string) {
    return runAction(moveId, () => configuredRuntime().api.defer(moveId), "Move deferred.");
  }

  function replaceMove(moveId: string) {
    return runAction(moveId, () => configuredRuntime().api.replace(moveId), "Move replaced.");
  }

  async function ensureOptions(move: DailyMoveV1, force = false) {
    if (move.source.type !== "transaction" && move.source.type !== "goal") return;
    if (!force && options.has(move.id)) return;
    const existing = pendingOptions.get(move.id);
    if (!force && existing) return existing;
    optionStates.set(move.id, "loading");
    optionErrors.delete(move.id);
    const request = configuredRuntime().api.options(move.id).then((loaded) => {
      if (loaded.moveId !== move.id) throw new Error("The completion options did not match this move.");
      const current = moves.value.find((candidate) => candidate.id === move.id);
      if (!current || current.source.type !== move.source.type || current.source.id !== move.source.id) return;
      options.set(move.id, loaded);
      optionStates.set(move.id, "ready");
    }).catch((error: unknown) => {
      optionStates.set(move.id, "error");
      optionErrors.set(move.id, safeMessage(error, "Unable to load completion options."));
    }).finally(() => {
      if (pendingOptions.get(move.id) === request) pendingOptions.delete(move.id);
    });
    pendingOptions.set(move.id, request);
    return request;
  }

  return {
    moves,
    remainingMoves,
    completedCount,
    recommendedMove,
    loadState,
    loadError,
    loadedDate,
    feedback,
    busyMoveIds,
    actionErrors,
    optionStates,
    optionErrors,
    options,
    ensureLoaded,
    completeMove,
    deferMove,
    replaceMove,
    ensureOptions,
  };
});
