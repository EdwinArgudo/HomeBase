import { flushPromises, mount } from "@vue/test-utils";

// Home resolves the household first, so a mount settles over two rounds.
async function settle() {
  await flushPromises();
  await flushPromises();
}
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { createFixtureAdventuresApi } from "./api/adventures";
import { createFixtureHouseholdApi } from "./api/household";
import { createFixtureLedgerApi } from "./api/ledger";
import { createFixturePlansApi } from "./api/fixturePlans";
import { createFixturePlaidLinkLauncher } from "./api/plaidLink";
import { displayWorldFixture } from "./fixtures/game";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configurePersonaRuntime } from "./stores/persona";
import { configureWorldRuntime } from "./stores/world";
import { configureAdventuresRuntime } from "./stores/adventures";
import { configureHouseholdRuntime } from "./stores/household";
import { configureLedgerRuntime } from "./stores/ledger";
import { configurePlansRuntime } from "./stores/plans";

async function mountAt(path: string) {
  configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  configureProgressRuntime({ api: createFixtureProgressApi() });
  configureRewardsRuntime({ api: createFixtureRewardsApi() });
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureWorldRuntime({ api: createFixtureWorldApi() });
  configureHouseholdRuntime({ api: createFixtureHouseholdApi() });
  configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
  configurePlansRuntime({ api: createFixturePlansApi() });
  configureAdventuresRuntime({ api: createFixtureAdventuresApi() });
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
    const wrapper = await mountAt("/");
    const primaryLinks = wrapper.findAll(".primary-nav a");
    const utilityLinks = wrapper.findAll(".utility-nav a");

    expect(primaryLinks.map((link) => link.text())).toEqual([
      "⌂Home",
      "✓Plans",
      "◇Adventures",
      "●Persona",
    ]);
    expect(utilityLinks.map((link) => link.text())).toEqual(["▦Ledger", "Household", "Display"]);
    expect(wrapper.get(".utility-nav .ledger-link").attributes("aria-label")).toBe("Ledger");
    expect(wrapper.get('.primary-nav a[href="/"]').attributes("aria-current")).toBe("page");
    expect(wrapper.find('.utility-nav a[aria-current="page"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("lets a member complete a move without a confirmation flow", async () => {
    const wrapper = await mountAt("/");
    await settle();
    const buttons = wrapper.findAll(".move-card .action-button");

    expect(wrapper.get(".count-bubble").text()).toContain("2 left");
    await buttons[0]?.trigger("click");
    await settle();
    expect(wrapper.get(".count-bubble").text()).toContain("1 left");
    expect(wrapper.findAll(".move-status").some((status) => status.text().includes("Done for today"))).toBe(true);

    wrapper.unmount();
  });

  it("selects labeled scene personas and updates the readable world state", async () => {
    const wrapper = await mountAt("/");
    await settle();
    const scenePersonaButtons = wrapper.findAll(".world-scene .persona-control");

    expect(scenePersonaButtons).toHaveLength(2);
    for (const button of scenePersonaButtons) {
      expect(button.element.tagName).toBe("BUTTON");
      expect(button.attributes("aria-label")).toMatch(/^Select .+, currently .+$/);
    }
    // The scene is the only place a companion is selected now, so it carries the
    // pressed state and the caption that used to live in a duplicate list.
    await scenePersonaButtons[1]?.trigger("click");
    expect(scenePersonaButtons[1]?.attributes("aria-pressed")).toBe("true");
    expect(scenePersonaButtons[0]?.attributes("aria-pressed")).toBe("false");
    expect(wrapper.get(".scene-caption").text()).toContain("Vienna");
    expect(wrapper.get(".world-text-equivalent").text()).toContain("Home summary");

    wrapper.unmount();
  });

  it("advances the accessible home summary after a move is completed", async () => {
    const wrapper = await mountAt("/");
    await settle();
    const summary = wrapper.get(".world-text-equivalent");

    expect(summary.text()).toContain("2 moves remain and 1 are done");
    await wrapper.get(".move-list .action-button").trigger("click");
    await settle();
    expect(summary.text()).toContain("1 move remains and 2 are done");

    wrapper.unmount();
  });

  it("makes the companion picker operable and stateful", async () => {
    const wrapper = await mountAt("/persona");
    await settle();
    await wrapper.get('.character-option input[value="cat"]').setValue();
    expect(wrapper.get(".persona-stage .persona-anchor").classes()).toContain("persona-character--cat");
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
