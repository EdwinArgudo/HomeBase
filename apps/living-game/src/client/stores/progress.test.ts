import { parseProgressBalance, parseProgressSnapshot, type ProgressBalanceV1, type ProgressSnapshotV1 } from "@homebase/contracts";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { configureProgressRuntime, useProgressStore } from "./progress";

function snapshot(balances: ProgressSnapshotV1["balances"] = []) {
  return parseProgressSnapshot({
    contractVersion: 1,
    householdId: "household-a",
    member: { id: "member-a", displayName: "Edwin" },
    balances,
    generatedAt: "2026-08-15T12:00:00.000Z",
  });
}

function balance(overrides: Partial<ProgressBalanceV1> = {}) {
  return parseProgressBalance({
    contractVersion: 1,
    id: "progress-tend",
    householdId: "household-a",
    memberId: "member-a",
    dimension: "tend",
    lifetimePoints: 168,
    level: 2,
    updatedAt: "2026-08-15T12:00:00.000Z",
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

describe("progress store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("dedupes loads and derives zero view models for a valid empty snapshot", async () => {
    const api = { load: vi.fn().mockResolvedValue(snapshot()) };
    configureProgressRuntime({ api });
    const store = useProgressStore();

    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    expect(api.load).toHaveBeenCalledOnce();
    expect(store.loadState).toBe("ready");
    expect(store.displayName).toBe("Edwin");
    expect(store.personalBalances.map((item) => [item.dimension, item.lifetimePoints, item.level])).toEqual([
      ["tend", 0, 1],
      ["move", 0, 1],
      ["grow", 0, 1],
      ["connect", 0, 1],
    ]);
    expect(store.personalTotalPoints).toBe(0);
    expect(store.personaLevel).toBe(1);
    expect(store.householdPoints).toBe(0);
    expect(store.householdLevel).toBe(1);
  });

  it("never falls back after load failure and supports retry", async () => {
    const api = { load: vi.fn().mockRejectedValueOnce(new Error("Please sign in again.")).mockResolvedValueOnce(snapshot([balance()])) };
    configureProgressRuntime({ api });
    const store = useProgressStore();

    await store.ensureLoaded();
    expect(store.loadState).toBe("error");
    expect(store.snapshot).toBeNull();
    expect(store.personalTotalPoints).toBe(0);
    await store.ensureLoaded(true);
    expect(store.loadState).toBe("ready");
    expect(store.personalTotalPoints).toBe(168);
  });

  it("ignores stale responses and computes levels and next-level percentages", async () => {
    const first = deferred<ProgressSnapshotV1>();
    const second = deferred<ProgressSnapshotV1>();
    const api = { load: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) };
    configureProgressRuntime({ api });
    const store = useProgressStore();
    const oldLoad = store.ensureLoaded();
    const newLoad = store.ensureLoaded(true);
    second.resolve(snapshot([
      balance({ lifetimePoints: 275, level: 3 }),
      balance({ id: "progress-move", dimension: "move", lifetimePoints: 99999, level: 1000 }),
      balance({ id: "progress-household", memberId: null, dimension: "household", lifetimePoints: 412, level: 5 }),
    ]));
    await newLoad;
    first.resolve(snapshot([balance({ lifetimePoints: 10, level: 1 })]));
    await oldLoad;

    expect(store.personalTotalPoints).toBe(100274);
    expect(store.personaLevel).toBe(1000);
    expect(store.personalBalances.find((item) => item.dimension === "tend")?.progressPercent).toBe(75);
    expect(store.personalBalances.find((item) => item.dimension === "move")?.progressPercent).toBe(100);
    expect(store.householdPoints).toBe(412);
    expect(store.householdLevel).toBe(5);
    expect(store.householdProgressPercent).toBe(12);
  });

  it("merges authoritative balances by identity without adding and ignores out-of-scope data", async () => {
    configureProgressRuntime({ api: { load: vi.fn().mockResolvedValue(snapshot([balance()])) } });
    const store = useProgressStore();
    await store.ensureLoaded();
    const updated = balance({ lifetimePoints: 178, updatedAt: "2026-08-15T12:05:00.000Z" });

    store.mergeAuthoritativeBalances([updated]);
    store.mergeAuthoritativeBalances([updated]);
    store.mergeAuthoritativeBalances([
      balance({ id: "partner", memberId: "member-b", lifetimePoints: 999, updatedAt: "2026-08-15T12:06:00.000Z" }),
    ]);
    expect(store.personalTotalPoints).toBe(178);
    expect(store.snapshot?.balances).toHaveLength(1);
  });
});
