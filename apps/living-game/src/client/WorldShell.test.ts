import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { displayWorldFixture } from "./fixtures/game";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configurePersonaRuntime } from "./stores/persona";
import { configureWorldRuntime } from "./stores/world";

async function mountAt(path: string) {
  configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  configureProgressRuntime({ api: createFixtureProgressApi() });
  configureRewardsRuntime({ api: createFixtureRewardsApi() });
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureWorldRuntime({ api: createFixtureWorldApi() });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...routes],
  });
  await router.push(path);
  await router.isReady();

  return mount(App, {
    attachTo: document.body,
    global: { plugins: [createPinia(), router] },
  });
}

describe("Living Game world shell", () => {
  it("separates primary destinations from utilities and marks the current route", async () => {
    const wrapper = await mountAt("/today");
    const primaryLinks = wrapper.findAll(".primary-nav a");
    const utilityLinks = wrapper.findAll(".utility-nav a");

    expect(primaryLinks.map((link) => link.text())).toEqual([
      "⌂World",
      "✓Today",
      "◇Adventures",
      "●Persona",
    ]);
    expect(utilityLinks.map((link) => link.text())).toEqual(["▦ Ledger", "Display"]);
    expect(wrapper.get('.primary-nav a[href="/today"]').attributes("aria-current")).toBe("page");
    expect(wrapper.find('.utility-nav a[aria-current="page"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("lets a member complete a move without a confirmation flow", async () => {
    const wrapper = await mountAt("/today");
    await flushPromises();
    const buttons = wrapper.findAll(".move-card .action-button");

    expect(wrapper.get(".count-bubble").text()).toContain("2 remaining");
    await buttons[0]?.trigger("click");
    await flushPromises();
    expect(wrapper.get(".count-bubble").text()).toContain("1 remaining");
    expect(wrapper.findAll(".move-status").some((status) => status.text().includes("Done for today"))).toBe(true);

    wrapper.unmount();
  });

  it("selects labeled scene personas and updates the readable world state", async () => {
    const wrapper = await mountAt("/");
    await flushPromises();
    const scenePersonaButtons = wrapper.findAll(".world-scene .persona-control");
    const personaButtons = wrapper.findAll(".world-readout button");

    expect(scenePersonaButtons).toHaveLength(2);
    for (const button of scenePersonaButtons) {
      expect(button.element.tagName).toBe("BUTTON");
      expect(button.attributes("aria-label")).toMatch(/^Select .+, currently .+$/);
    }
    expect(personaButtons).toHaveLength(2);
    await scenePersonaButtons[1]?.trigger("click");
    expect(personaButtons[1]?.attributes("aria-pressed")).toBe("true");
    expect(wrapper.get(".selected-persona-note").text()).toContain("Vienna");
    expect(wrapper.get(".world-text-equivalent").text()).toContain("World summary");

    wrapper.unmount();
  });

  it("advances the accessible world summary after completing its recommended move", async () => {
    const wrapper = await mountAt("/");
    await flushPromises();
    const summary = wrapper.get(".world-text-equivalent");

    expect(summary.text()).toContain("Choose the weekend groceries");
    await wrapper.get(".recommended-move .action-button").trigger("click");
    await flushPromises();
    expect(summary.text()).toContain("Practice five travel phrases");
    expect(summary.text()).not.toContain("Choose the weekend groceries");

    wrapper.unmount();
  });

  it("makes the saved manual outfit control operable and stateful", async () => {
    const wrapper = await mountAt("/persona");
    await flushPromises();
    const outfit = wrapper.findAll(".persona-builder label").find((label) => label.text().includes("Outfit"))!.get("select");
    await outfit.setValue("berry");
    expect(wrapper.get(".persona-stage .persona-anchor").classes()).toContain("persona-anchor--berry");
    expect(wrapper.text()).toContain("Unsaved changes");

    wrapper.unmount();
  });

  it("keeps the apartment display on the display-safe projection", async () => {
    expect(displayWorldFixture.viewer).toBe("display");
    for (const entity of [
      ...displayWorldFixture.personas,
      ...displayWorldFixture.items,
      ...displayWorldFixture.adventures,
    ]) {
      expect(entity.visibility).toBe("display");
    }

    const wrapper = await mountAt("/display");
    const text = wrapper.get("main").text();
    expect(text).toContain("No personal or financial details are shown");
    expect(text).not.toContain("Practice five travel phrases");
    expect(text).not.toContain("$820");
    expect(wrapper.findAll(".world-scene button")).toHaveLength(0);

    wrapper.unmount();
  });
});
