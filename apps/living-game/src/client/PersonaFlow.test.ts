import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { createFixtureAdventuresApi } from "./api/adventures";
import { createFixtureHouseholdApi } from "./api/household";
import PersonaSprite from "./components/PersonaSprite.vue";
import { worldFixture } from "./fixtures/game";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureWorldRuntime } from "./stores/world";
import { configureAdventuresRuntime } from "./stores/adventures";
import { configureHouseholdRuntime } from "./stores/household";

describe("manual persona flow", () => {
  it("renders allow-listed appearance through fixed classes", () => {
    const wrapper = mount(PersonaSprite, {
      props: {
        persona: worldFixture.personas[0]!,
        variant: "sun",
        static: true,
        appearance: { character: "bunny" },
      },
    });
    expect(wrapper.get(".persona-anchor").classes()).toEqual(expect.arrayContaining([
      "persona-character--bunny", "persona-species--bunny",
    ]));
    expect(wrapper.get(".companion-emblem--first-tend").text()).toBe("✦");
    expect(wrapper.get(".persona-control--static").attributes("aria-label")).toContain("Steady Hands emblem");
  });

  it("draws the companion with colour supplied only through fixed classes", () => {
    const wrapper = mount(PersonaSprite, {
      props: {
        persona: worldFixture.personas[0]!,
        variant: "sun",
        static: true,
        appearance: { character: "bunny" },
      },
    });

    const shapes = wrapper.findAll(".companion__art *");
    expect(shapes.length).toBeGreaterThan(10);
    for (const shape of shapes) {
      // Colour comes from a stylesheet class, never from an attribute built out
      // of persona data.
      expect(shape.attributes("style")).toBeUndefined();
      expect(shape.attributes("fill")).toBeUndefined();
      expect(shape.attributes("stroke")).toBeUndefined();
    }
    // Species and accessory are drawn, not described by inline values.
    expect(wrapper.findAll(".ear--fill").length).toBe(2);
    expect(wrapper.findAll(".accessory-fill").length).toBe(2);
    expect(wrapper.findAll(".mark--belly").length).toBe(1);
  });

  it("saves and approves the current persona through its dedicated API", async () => {
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    configureProgressRuntime({ api: createFixtureProgressApi() });
    configureRewardsRuntime({ api: createFixtureRewardsApi() });
    configurePersonaRuntime({ api: createFixturePersonaApi() });
    configureWorldRuntime({ api: createFixtureWorldApi() });
  configureHouseholdRuntime({ api: createFixtureHouseholdApi() });
    configureAdventuresRuntime({ api: createFixtureAdventuresApi() });
    const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
    await router.push("/persona");
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    await wrapper.get('input[required]').setValue("Pixel Edwin");
    await wrapper.get('.character-option input[value="cat"]').setValue();
    await wrapper.get('button[type="submit"]').trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Persona saved as a draft");
    await wrapper.findAll(".persona-builder__actions button")[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Persona approved and ready");

    wrapper.unmount();
  });
});
