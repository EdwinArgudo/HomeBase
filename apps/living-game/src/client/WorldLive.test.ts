import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";
import { configureWorldRuntime } from "./stores/world";

async function mountWorld(load: () => ReturnType<ReturnType<typeof createFixtureWorldApi>["load"]>) {
  configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  configureProgressRuntime({ api: createFixtureProgressApi() });
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureWorldRuntime({ api: { load } });
  const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
  await router.push("/");
  await router.isReady();
  return mount(App, { global: { plugins: [createPinia(), router] } });
}

describe("live household World", () => {
  it("shows a retryable failure, then renders and selects only returned personas", async () => {
    const fixture = await createFixtureWorldApi().load();
    const load = vi.fn().mockRejectedValueOnce(new Error("Household world is temporarily unavailable.")).mockResolvedValueOnce(fixture);
    const wrapper = await mountWorld(load);
    await flushPromises();
    expect(wrapper.get(".persona-load-state[role='alert']").text()).toContain("temporarily unavailable");
    expect(wrapper.find(".world-scene").exists()).toBe(false);
    await wrapper.get(".persona-load-state button").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".world-scene .persona-control")).toHaveLength(2);
    expect(wrapper.text()).toContain("Edwin");
    expect(wrapper.text()).toContain("Vienna");
    const buttons = wrapper.findAll(".world-scene .persona-control");
    await buttons[1]!.trigger("click");
    expect(wrapper.get(".selected-persona-note").text()).toContain("Vienna");
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("renders a valid empty live projection without fixture personas", async () => {
    const fixture = await createFixtureWorldApi().load();
    const wrapper = await mountWorld(vi.fn().mockResolvedValue({ ...fixture, personas: [] }));
    await flushPromises();
    expect(wrapper.text()).toContain("No household personas are visible yet");
    expect(wrapper.find(".world-scene").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Vienna");
    wrapper.unmount();
  });
});
