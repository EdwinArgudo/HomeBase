import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFixturePersonaApi } from "../api/fixturePersona";
import { configurePersonaRuntime, usePersonaStore } from "./persona";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("persona store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("dedupes loads, accepts an empty live snapshot, and retries without fixture fallback", async () => {
    const pending = deferred<Awaited<ReturnType<ReturnType<typeof createFixturePersonaApi>["load"]>>>();
    const empty = { contractVersion: 1 as const, householdId: "household-homebase", memberId: "member-edwin", persona: null, generatedAt: "2026-08-15T12:00:00.000Z" };
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty);
    configurePersonaRuntime({ api: { load, save: vi.fn(), approve: vi.fn() } });
    const store = usePersonaStore();
    const one = store.ensureLoaded();
    const two = store.ensureLoaded();
    expect(load).toHaveBeenCalledTimes(1);
    pending.reject(new Error("Persona is temporarily unavailable."));
    await Promise.all([one, two]);
    expect(store.loadState).toBe("error");
    expect(store.persona).toBeNull();
    await store.ensureLoaded(true);
    expect(store.loadState).toBe("ready");
    expect(store.persona).toBeNull();
  });

  it("replaces state only with authoritative save and approval responses", async () => {
    const api = createFixturePersonaApi();
    configurePersonaRuntime({ api });
    const store = usePersonaStore();
    await store.ensureLoaded();
    const input = { contractVersion: 1 as const, displayName: "Changed", visibility: "household" as const, appearance: { ...store.persona!.appearance, palette: "blush" as const } };
    expect(await store.save(input)).toBe(true);
    expect(store.persona?.displayName).toBe("Changed");
    expect(store.persona?.status).toBe("draft");
    expect(await store.approve()).toBe(true);
    expect(store.persona?.status).toBe("ready");
  });
});
