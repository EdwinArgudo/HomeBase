import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFixtureWorldApi } from "../api/fixtureWorld";
import { configureWorldRuntime, useWorldStore } from "./world";

describe("world store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("loads, selects only returned personas, and refreshes authoritative data", async () => {
    const fixture = createFixtureWorldApi();
    const first = await fixture.load();
    const second = { ...first, personas: [first.personas[1]!] };
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    configureWorldRuntime({ api: { load } });
    const store = useWorldStore();
    await store.ensureLoaded();
    expect(store.projection?.personas).toHaveLength(2);
    store.selectPersona(first.personas[1]!.id);
    expect(store.selectedPersona?.id).toBe(first.personas[1]!.id);
    store.selectPersona("persona-not-returned");
    expect(store.selectedPersona?.id).toBe(first.personas[1]!.id);
    await store.ensureLoaded(true);
    expect(store.projection?.personas).toHaveLength(1);
    expect(store.selectedPersona?.id).toBe(first.personas[1]!.id);
  });

  it("dedupes loads and exposes empty, error, and retry states without fallback", async () => {
    const empty = { ...(await createFixtureWorldApi().load()), personas: [] };
    let reject!: (reason: unknown) => void;
    const pending = new Promise<typeof empty>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(empty);
    configureWorldRuntime({ api: { load } });
    const store = useWorldStore();
    const first = store.ensureLoaded();
    const duplicate = store.ensureLoaded();
    expect(load).toHaveBeenCalledTimes(1);
    reject(new Error("World is temporarily unavailable."));
    await Promise.all([first, duplicate]);
    expect(store.loadState).toBe("error");
    expect(store.projection).toBeNull();
    await store.ensureLoaded(true);
    expect(store.loadState).toBe("ready");
    expect(store.projection?.personas).toEqual([]);
  });
});
