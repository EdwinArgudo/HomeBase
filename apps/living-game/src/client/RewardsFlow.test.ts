import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import type { RewardsApi } from "./api/rewards";
import type { WorldApi } from "./api/world";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureWorldRuntime } from "./stores/world";

async function mountPersona(api: RewardsApi, worldLoad: WorldApi["load"] = createFixtureWorldApi().load) {
  configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  configureProgressRuntime({ api: createFixtureProgressApi() });
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureWorldRuntime({ api: { load: worldLoad } });
  configureRewardsRuntime({ api });
  const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
  await router.push("/persona");
  await router.isReady();
  return { wrapper: mount(App, { global: { plugins: [createPinia(), router] } }), router };
}

describe("Persona reward shelf", () => {
  it("shows a retryable failure, then permanent unlocked and locked progress", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const load = vi.fn().mockRejectedValueOnce(new Error("Rewards are temporarily unavailable.")).mockResolvedValue(fixture);
    const { wrapper } = await mountPersona({ load, equip: vi.fn() });
    await flushPromises();
    expect(wrapper.get(".reward-state[role='alert']").text()).toContain("temporarily unavailable");
    await wrapper.get(".reward-state button").trigger("click");
    await flushPromises();
    expect(wrapper.get(".reward-shelf").text()).toContain("2/5 unlocked");
    expect(wrapper.get(".reward-shelf").text()).toContain("Steady Hands");
    expect(wrapper.get(".reward-shelf").text()).toContain("Equipped");
    expect(wrapper.get(".reward-shelf").text()).toContain("4/10");
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("refreshes on each Persona mount and represents no persona honestly", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const noPersona = { ...fixture, personaId: null, equippedRewardKey: null, rewards: fixture.rewards.map((entry) => ({ ...entry, currentPoints: 0, unlockedAt: null })) };
    const load = vi.fn().mockResolvedValue(noPersona);
    const { wrapper, router } = await mountPersona({ load, equip: vi.fn() });
    await flushPromises();
    expect(wrapper.get(".reward-state").text()).toContain("Create a persona");
    await router.push("/today");
    await flushPromises();
    await router.push("/persona");
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("equips and removes only unlocked emblems from server results and refreshes World", async () => {
    const fixtureApi = createFixtureRewardsApi();
    const initial = await fixtureApi.load();
    const householdEquipped = { ...initial, equippedRewardKey: "first-household" as const };
    const removed = { ...initial, equippedRewardKey: null };
    let resolveEquip!: (value: typeof householdEquipped) => void;
    const pendingEquip = new Promise<typeof householdEquipped>((resolve) => { resolveEquip = resolve; });
    const equip = vi.fn().mockReturnValueOnce(pendingEquip).mockResolvedValueOnce(removed);
    const worldFixture = await createFixtureWorldApi().load();
    const worldLoad = vi.fn().mockResolvedValue({
      ...worldFixture,
      personas: worldFixture.personas.map((persona, index) => index === 0 ? { ...persona, equippedRewardKey: "first-household" as const } : persona),
    });
    const load = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(householdEquipped);
    const { wrapper, router } = await mountPersona({ load, equip }, worldLoad);
    await flushPromises();

    expect(wrapper.get('button[aria-label="Gentle Motion emblem locked"]').attributes("disabled")).toBeDefined();
    await wrapper.get('button[aria-label="Equip Shared Spark emblem"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".reward-equip").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    resolveEquip(householdEquipped);
    await flushPromises();
    expect(equip).toHaveBeenCalledWith("first-household");
    expect(wrapper.get('button[aria-label="Remove Shared Spark emblem"]').text()).toContain("Equipped");
    expect(wrapper.find(".companion-emblem--first-household").exists()).toBe(true);
    expect(wrapper.get(".reward-action-feedback[role='status']").text()).toContain("Emblem equipped");
    expect(worldLoad).toHaveBeenCalledTimes(1);

    await router.push("/");
    await flushPromises();
    expect(wrapper.find(".world-scene .companion-emblem--first-household").exists()).toBe(true);
    await router.push("/persona");
    await flushPromises();
    await wrapper.get('button[aria-label="Remove Shared Spark emblem"]').trigger("click");
    await flushPromises();
    expect(equip).toHaveBeenLastCalledWith(null);
    expect(wrapper.find(".companion-emblem--first-household").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the authoritative emblem on action failure and allows a safe retry", async () => {
    const fixtureApi = createFixtureRewardsApi();
    const initial = await fixtureApi.load();
    const removed = await fixtureApi.equip(null);
    const equip = vi.fn()
      .mockRejectedValueOnce(new Error("Loadout is temporarily unavailable."))
      .mockResolvedValueOnce(removed);
    const worldLoad = vi.fn().mockImplementation(createFixtureWorldApi().load);
    const { wrapper } = await mountPersona({ load: vi.fn().mockResolvedValue(initial), equip }, worldLoad);
    await flushPromises();
    const remove = () => wrapper.get('button[aria-label="Remove Steady Hands emblem"]');
    await remove().trigger("click");
    await flushPromises();
    expect(wrapper.get(".reward-action-feedback[role='alert']").text()).toContain("temporarily unavailable");
    expect(wrapper.find(".companion-emblem--first-tend").exists()).toBe(true);
    expect(worldLoad).not.toHaveBeenCalled();
    await remove().trigger("click");
    await flushPromises();
    expect(wrapper.find(".companion-emblem--first-tend").exists()).toBe(false);
    expect(worldLoad).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
