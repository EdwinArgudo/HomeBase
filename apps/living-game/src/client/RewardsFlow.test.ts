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
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureWorldRuntime } from "./stores/world";

async function mountPersona(load: RewardsApi["load"]) {
  configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  configureProgressRuntime({ api: createFixtureProgressApi() });
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureWorldRuntime({ api: createFixtureWorldApi() });
  configureRewardsRuntime({ api: { load } });
  const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
  await router.push("/persona");
  await router.isReady();
  return { wrapper: mount(App, { global: { plugins: [createPinia(), router] } }), router };
}

describe("Persona reward shelf", () => {
  it("shows a retryable failure, then permanent unlocked and locked progress", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const load = vi.fn().mockRejectedValueOnce(new Error("Rewards are temporarily unavailable.")).mockResolvedValue(fixture);
    const { wrapper } = await mountPersona(load);
    await flushPromises();
    expect(wrapper.get(".reward-state[role='alert']").text()).toContain("temporarily unavailable");
    await wrapper.get(".reward-state button").trigger("click");
    await flushPromises();
    expect(wrapper.get(".reward-shelf").text()).toContain("2/5 unlocked");
    expect(wrapper.get(".reward-shelf").text()).toContain("Steady Hands");
    expect(wrapper.get(".reward-shelf").text()).toContain("Unlocked");
    expect(wrapper.get(".reward-shelf").text()).toContain("4/10");
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("refreshes on each Persona mount and represents no persona honestly", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const noPersona = { ...fixture, personaId: null, rewards: fixture.rewards.map((entry) => ({ ...entry, currentPoints: 0, unlockedAt: null })) };
    const load = vi.fn().mockResolvedValue(noPersona);
    const { wrapper, router } = await mountPersona(load);
    await flushPromises();
    expect(wrapper.get(".reward-state").text()).toContain("Create a persona");
    await router.push("/today");
    await flushPromises();
    await router.push("/persona");
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
