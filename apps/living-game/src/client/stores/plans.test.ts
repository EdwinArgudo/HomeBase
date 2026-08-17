import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFixturePlansApi } from "../api/fixturePlans";
import { configurePlansRuntime, usePlansStore } from "./plans";

describe("plans store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("dedupes loads and retries an explicit empty snapshot without fallback", async () => {
    const empty = { ...(await createFixturePlansApi().load()), tasks: [], groceries: [], goals: [] };
    let reject!: (reason: unknown) => void;
    const pending = new Promise<typeof empty>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(empty);
    configurePlansRuntime({ api: { load, act: vi.fn() } });
    const store = usePlansStore();
    const a = store.ensureLoaded(); const b = store.ensureLoaded();
    expect(load).toHaveBeenCalledTimes(1);
    reject(new Error("Plans are temporarily unavailable."));
    await Promise.all([a, b]);
    expect(store.loadState).toBe("error"); expect(store.snapshot).toBeNull();
    await store.ensureLoaded(true);
    expect(store.snapshot).toMatchObject({ tasks: [], groceries: [], goals: [] });
  });

  it("queues concurrent actions instead of dropping them, and changes state only from responses", async () => {
    const fixture = createFixturePlansApi();
    const initial = await fixture.load();
    const changed = await fixture.act({ contractVersion: 1, action: "toggle_task", id: "task-dinners" });
    let resolve!: (value: typeof changed) => void;
    const pending = new Promise<typeof changed>((done) => { resolve = done; });
    const act = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(changed);
    configurePlansRuntime({ api: { load: vi.fn().mockResolvedValue(initial), act } });
    const store = usePlansStore(); await store.ensureLoaded();

    // A tap while another write is in flight waits its turn rather than being
    // ignored — two taps should do two things.
    const first = store.toggleTask("task-dinners");
    const second = store.addGrocery("Apples");
    // The queue hands the first write to the API on the next microtask.
    await Promise.resolve();
    expect(act).toHaveBeenCalledTimes(1);
    expect(store.snapshot?.tasks[0]?.status).toBe("open");

    // Only what you touched reads as busy, so one tap cannot disable the page.
    expect(store.isBusy("task:task-dinners")).toBe(true);
    expect(store.isBusy("grocery:add")).toBe(false);

    resolve(changed);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(act).toHaveBeenCalledTimes(2);
    expect(store.snapshot?.tasks[0]?.status).toBe("complete");
    expect(store.isBusy("task:task-dinners")).toBe(false);
  });

  it("a failed write leaves the queue usable and the snapshot untouched", async () => {
    const fixture = createFixturePlansApi();
    const initial = await fixture.load();
    const changed = await fixture.act({ contractVersion: 1, action: "toggle_task", id: "task-dinners" });
    const act = vi.fn()
      .mockRejectedValueOnce(new Error("Update failed safely."))
      .mockResolvedValueOnce(changed);
    configurePlansRuntime({ api: { load: vi.fn().mockResolvedValue(initial), act } });
    const store = usePlansStore(); await store.ensureLoaded();

    await expect(store.addGrocery("Apples")).resolves.toBe(false);
    expect(store.actionError).toBe("Update failed safely.");
    expect(store.snapshot?.groceries.some((item) => item.name === "Apples")).toBe(false);

    await expect(store.toggleTask("task-dinners")).resolves.toBe(true);
    expect(store.snapshot?.tasks[0]?.status).toBe("complete");
    expect(store.actionError).toBe("");
  });
});
