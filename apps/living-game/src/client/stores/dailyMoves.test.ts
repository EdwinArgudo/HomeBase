import {
  parseDailyMove,
  parseMoveCompletionOptions,
  parseProgressBalance,
  parseProgressSnapshot,
  type DailyMoveV1,
} from "@homebase/contracts";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dailyMoveFixtures } from "../fixtures/game";
import type { DailyMovesApi } from "../api/dailyMoves";
import { configureDailyMovesRuntime, localCalendarDate, useDailyMovesStore } from "./dailyMoves";
import { configureProgressRuntime, useProgressStore } from "./progress";

const testDate = new Date(2026, 7, 15, 23, 30);

function move(overrides: Partial<DailyMoveV1> = {}) {
  return parseDailyMove({
    ...dailyMoveFixtures[0],
    localDate: "2026-08-15",
    source: { ...dailyMoveFixtures[0].source },
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockApi(overrides: Partial<DailyMovesApi> = {}) {
  return {
    load: vi.fn().mockResolvedValue([move()]),
    complete: vi.fn().mockResolvedValue({
      move: move({ status: "complete", completedAt: "2026-08-15T12:00:00.000Z" }),
      event: null,
      balances: [],
    }),
    defer: vi.fn().mockResolvedValue(move({ status: "deferred", completedAt: null })),
    replace: vi.fn().mockResolvedValue(move({ title: "Authoritative replacement", shortLabel: "New move" })),
    options: vi.fn().mockResolvedValue(parseMoveCompletionOptions({ contractVersion: 1, moveId: "move-groceries", kind: "none" })),
    ...overrides,
  };
}

function configure(api: DailyMovesApi) {
  configureDailyMovesRuntime({ api, now: () => testDate });
}

describe("daily moves store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("formats the query date from browser-local calendar components", () => {
    expect(localCalendarDate(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02");
  });

  it("loads a real snapshot once and accepts an empty snapshot without fixtures", async () => {
    const api = mockApi();
    configure(api);
    const store = useDailyMovesStore();

    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    expect(api.load).toHaveBeenCalledOnce();
    expect(api.load).toHaveBeenCalledWith("2026-08-15");
    expect(store.moves).toHaveLength(1);
    expect(store.loadState).toBe("ready");

    vi.mocked(api.load).mockResolvedValueOnce([]);
    await store.ensureLoaded(true);
    expect(store.moves).toEqual([]);
    expect(store.loadState).toBe("ready");
  });

  it("does not fall back to fixtures after an error and supports retry", async () => {
    const api = mockApi({ load: vi.fn().mockRejectedValueOnce(new Error("Please sign in again.")).mockResolvedValueOnce([move()]) });
    configure(api);
    const store = useDailyMovesStore();

    await store.ensureLoaded();
    expect(store.loadState).toBe("error");
    expect(store.loadError).toBe("Please sign in again.");
    expect(store.moves).toEqual([]);

    await store.ensureLoaded(true);
    expect(store.loadState).toBe("ready");
    expect(store.moves).toHaveLength(1);
  });

  it("ignores stale load responses", async () => {
    const first = deferred<DailyMoveV1[]>();
    const second = deferred<DailyMoveV1[]>();
    const api = mockApi({ load: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
    configure(api);
    const store = useDailyMovesStore();

    const firstLoad = store.ensureLoaded();
    const secondLoad = store.ensureLoaded(true);
    second.resolve([move({ title: "Newest response" })]);
    await secondLoad;
    first.resolve([move({ title: "Stale response" })]);
    await firstLoad;

    expect(store.moves[0]?.title).toBe("Newest response");
  });

  it("waits for authoritative completion and guards duplicate clicks", async () => {
    const completion = deferred<Awaited<ReturnType<DailyMovesApi["complete"]>>>();
    const api = mockApi({ complete: vi.fn().mockReturnValue(completion.promise) });
    configure(api);
    const store = useDailyMovesStore();
    await store.ensureLoaded();

    const first = store.completeMove("move-groceries", {});
    const duplicate = store.completeMove("move-groceries", {});
    expect(store.moves[0]?.status).toBe("active");
    expect(store.busyMoveIds.has("move-groceries")).toBe(true);
    expect(api.complete).toHaveBeenCalledOnce();

    completion.resolve({
      move: move({ status: "complete", completedAt: "2026-08-15T12:00:00.000Z" }),
      event: null,
      balances: [],
    });
    await Promise.all([first, duplicate]);
    expect(store.moves[0]?.status).toBe("complete");
    expect(store.busyMoveIds.has("move-groceries")).toBe(false);
  });

  it("uses only authoritative defer and replacement responses", async () => {
    const api = mockApi();
    configure(api);
    const store = useDailyMovesStore();
    await store.ensureLoaded();

    await store.deferMove("move-groceries");
    expect(store.moves[0]?.status).toBe("deferred");
    vi.mocked(api.load).mockResolvedValueOnce([move()]);
    await store.ensureLoaded(true);
    await store.replaceMove("move-groceries");
    expect(store.moves[0]?.id).toBe("move-groceries");
    expect(store.moves[0]?.title).toBe("Authoritative replacement");
  });

  it("loads completion options only for relevant sources and caches by move", async () => {
    const transaction = move({ source: { type: "transaction", id: "transaction-a" } });
    const options = parseMoveCompletionOptions({
      contractVersion: 1,
      moveId: transaction.id,
      kind: "transaction",
      categories: [{ id: "category-a", name: "Groceries", ownership: "shared" }],
      createRuleDefault: false,
    });
    const api = mockApi({
      load: vi.fn().mockResolvedValue([transaction]),
      options: vi.fn().mockResolvedValue(options),
    });
    configure(api);
    const store = useDailyMovesStore();

    await store.ensureLoaded();
    await store.ensureOptions(store.moves[0]!);
    await store.ensureOptions(store.moves[0]!);
    await store.ensureOptions(move());
    expect(api.options).toHaveBeenCalledOnce();
    expect(store.options.get(transaction.id)).toEqual(options);
  });

  it("merges only authoritative completion balances and converges on duplicate responses", async () => {
    const starting = parseProgressBalance({
      contractVersion: 1,
      id: "progress-tend",
      householdId: "household-homebase",
      memberId: "member-edwin",
      dimension: "tend",
      lifetimePoints: 10,
      level: 1,
      updatedAt: "2026-08-15T11:00:00.000Z",
    });
    const awarded = parseProgressBalance({
      ...starting,
      lifetimePoints: 20,
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
    configureProgressRuntime({
      api: {
        load: vi.fn().mockResolvedValue(parseProgressSnapshot({
          contractVersion: 1,
          householdId: "household-homebase",
          member: { id: "member-edwin", displayName: "Edwin" },
          balances: [starting],
          generatedAt: "2026-08-15T11:00:00.000Z",
        })),
      },
    });
    const api = mockApi({
      complete: vi.fn().mockResolvedValue({
        move: move({ status: "complete", completedAt: "2026-08-15T12:00:00.000Z" }),
        event: null,
        balances: [awarded],
      }),
    });
    configure(api);
    const progress = useProgressStore();
    const moves = useDailyMovesStore();
    await Promise.all([progress.ensureLoaded(), moves.ensureLoaded()]);

    await moves.completeMove("move-groceries", {});
    await moves.completeMove("move-groceries", {});
    expect(progress.personalTotalPoints).toBe(20);
    expect(progress.snapshot?.balances).toHaveLength(1);

    vi.mocked(api.complete).mockRejectedValueOnce(new Error("Completion failed."));
    await moves.completeMove("move-groceries", {});
    expect(progress.personalTotalPoints).toBe(20);

    vi.mocked(api.load).mockResolvedValueOnce([move()]);
    await moves.ensureLoaded(true);
    await moves.deferMove("move-groceries");
    vi.mocked(api.load).mockResolvedValueOnce([move()]);
    await moves.ensureLoaded(true);
    await moves.replaceMove("move-groceries");
    expect(progress.personalTotalPoints).toBe(20);
  });
});
