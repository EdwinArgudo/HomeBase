import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFixtureRewardsApi } from "../api/fixtureRewards";
import { configureRewardsRuntime, useRewardsStore } from "./rewards";

describe("rewards store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("dedupes reads and refreshes from authoritative snapshots", async () => {
    const fixture = await createFixtureRewardsApi().load();
    let resolve!: (value: typeof fixture) => void;
    const first = new Promise<typeof fixture>((resolvePromise) => { resolve = resolvePromise; });
    const changed = { ...fixture, equippedRewardKey: null, rewards: fixture.rewards.map((entry) => ({ ...entry, currentPoints: 0, unlockedAt: null })) };
    const load = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(changed);
    configureRewardsRuntime({ api: { load, equip: vi.fn() } });
    const store = useRewardsStore();
    const initial = store.ensureLoaded();
    const duplicate = store.ensureLoaded();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(fixture);
    await Promise.all([initial, duplicate]);
    expect(store.snapshot?.rewards.filter((entry) => entry.unlockedAt)).toHaveLength(2);
    await store.ensureLoaded(true);
    expect(store.snapshot?.rewards.filter((entry) => entry.unlockedAt)).toHaveLength(0);
  });

  it("exposes an error and retries to a valid empty/no-persona snapshot without fallback", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const noPersona = { ...fixture, personaId: null, equippedRewardKey: null, rewards: fixture.rewards.map((entry) => ({ ...entry, currentPoints: 0, unlockedAt: null })) };
    const load = vi.fn().mockRejectedValueOnce(new Error("Rewards are temporarily unavailable.")).mockResolvedValueOnce(noPersona);
    configureRewardsRuntime({ api: { load, equip: vi.fn() } });
    const store = useRewardsStore();
    await store.ensureLoaded();
    expect(store.loadState).toBe("error");
    expect(store.snapshot).toBeNull();
    expect(store.loadError).toBe("Rewards are temporarily unavailable.");
    await store.ensureLoaded(true);
    expect(store.loadState).toBe("ready");
    expect(store.snapshot?.personaId).toBeNull();
    expect(store.snapshot?.rewards.every((entry) => entry.unlockedAt === null)).toBe(true);
  });

  it("uses authoritative equip results, blocks duplicate actions, and preserves state on failure", async () => {
    const fixtureApi = createFixtureRewardsApi();
    const initial = await fixtureApi.load();
    const removed = await fixtureApi.equip(null);
    let resolve!: (value: typeof removed) => void;
    const pending = new Promise<typeof removed>((resolvePromise) => { resolve = resolvePromise; });
    const equip = vi.fn().mockReturnValueOnce(pending).mockRejectedValueOnce(new Error("Equip is temporarily unavailable."));
    configureRewardsRuntime({ api: { load: vi.fn().mockResolvedValue(initial), equip } });
    const store = useRewardsStore();
    await store.ensureLoaded();
    const first = store.equip(null);
    await expect(store.equip(null)).resolves.toBe(false);
    expect(equip).toHaveBeenCalledTimes(1);
    expect(store.snapshot?.equippedRewardKey).toBe("first-tend");
    resolve(removed);
    await expect(first).resolves.toBe(true);
    expect(store.snapshot?.equippedRewardKey).toBeNull();
    await expect(store.equip("first-tend")).resolves.toBe(false);
    expect(store.snapshot?.equippedRewardKey).toBeNull();
    expect(store.actionError).toBe("Equip is temporarily unavailable.");
  });
});
