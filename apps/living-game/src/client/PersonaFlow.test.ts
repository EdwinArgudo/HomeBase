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
import PersonaSprite from "./components/PersonaSprite.vue";
import { worldFixture } from "./fixtures/game";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureWorldRuntime } from "./stores/world";

describe("manual persona flow", () => {
  it("renders allow-listed appearance through fixed classes", () => {
    const wrapper = mount(PersonaSprite, {
      props: {
        persona: worldFixture.personas[0]!,
        variant: "sun",
        static: true,
        appearance: { skinPalette: "deep", hairStyle: "curls", hairColor: "midnight", outfit: "sun", accent: "glasses" },
      },
    });
    expect(wrapper.get(".persona-anchor").classes()).toEqual(expect.arrayContaining([
      "persona-skin--deep", "persona-hair--curls", "persona-hair-color--midnight", "persona-outfit--sun", "persona-accent--glasses",
    ]));
  });

  it("saves and approves the current persona through its dedicated API", async () => {
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    configureProgressRuntime({ api: createFixtureProgressApi() });
    configureRewardsRuntime({ api: createFixtureRewardsApi() });
    configurePersonaRuntime({ api: createFixturePersonaApi() });
    configureWorldRuntime({ api: createFixtureWorldApi() });
    const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
    await router.push("/persona");
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    await wrapper.get('input[required]').setValue("Pixel Edwin");
    const outfit = wrapper.findAll(".persona-builder label").find((label) => label.text().includes("Outfit"))!.get("select");
    await outfit.setValue("berry");
    await wrapper.get('button[type="submit"]').trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Persona saved as a draft");
    await wrapper.findAll(".persona-builder__actions button")[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Persona approved and ready");

    wrapper.unmount();
  });
});
