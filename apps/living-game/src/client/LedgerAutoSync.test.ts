import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureLedgerApi } from "./api/ledger";
import { createFixturePlaidLinkLauncher } from "./api/plaidLink";
import { configureLedgerRuntime, useLedgerStore } from "./stores/ledger";

describe("automatic Plaid refresh lifecycle", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("runs on mount, focus, visibility, and interval; dedupes and cleans up", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const fixture = createFixtureLedgerApi();
    const load = vi.fn(fixture.load);
    let resolveFirst!: (value: { refreshed: number; needsAttention: number }) => void;
    const first = new Promise<{ refreshed: number; needsAttention: number }>((resolve) => { resolveFirst = resolve; });
    const autoSync = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ refreshed: 0, needsAttention: 0 });
    configureLedgerRuntime({ api: { ...fixture, load, autoSync }, openPlaidLink: createFixturePlaidLinkLauncher() });
    const store = useLedgerStore();
    await store.ensureLoaded();
    store.startAutoSync();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(autoSync).toHaveBeenCalledTimes(1);
    resolveFirst({ refreshed: 1, needsAttention: 0 });
    await store.autoSync();
    expect(load).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("focus")); await store.autoSync();
    document.dispatchEvent(new Event("visibilitychange")); await store.autoSync();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(autoSync).toHaveBeenCalledTimes(4);
    store.stopAutoSync();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
    expect(autoSync).toHaveBeenCalledTimes(4);
  });
});
