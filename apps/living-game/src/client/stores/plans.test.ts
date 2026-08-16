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

  it("guards duplicate actions and changes state only from the authoritative response", async () => {
    const fixture = createFixturePlansApi();
    const initial = await fixture.load();
    const changed = await fixture.act({ contractVersion: 1, action: "toggle_task", id: "task-dinners" });
    let resolve!: (value: typeof changed) => void;
    const pending = new Promise<typeof changed>((done) => { resolve = done; });
    const act = vi.fn().mockReturnValueOnce(pending).mockRejectedValueOnce(new Error("Update failed safely."));
    configurePlansRuntime({ api: { load: vi.fn().mockResolvedValue(initial), act } });
    const store = usePlansStore(); await store.ensureLoaded();
    const first = store.toggleTask("task-dinners");
    await expect(store.toggleTask("task-dinners")).resolves.toBe(false);
    await expect(store.toggleGrocery("grocery-oats")).resolves.toBe(false);
    await expect(store.addGrocery("Apples")).resolves.toBe(false);
    expect(act).toHaveBeenCalledTimes(1);
    expect(store.snapshot?.tasks[0]?.status).toBe("open");
    resolve(changed); await expect(first).resolves.toBe(true);
    expect(store.snapshot?.tasks[0]?.status).toBe("complete");
    await expect(store.addGrocery("Apples")).resolves.toBe(false);
    expect(store.snapshot?.groceries.some((item) => item.name === "Apples")).toBe(false);
  });
});
