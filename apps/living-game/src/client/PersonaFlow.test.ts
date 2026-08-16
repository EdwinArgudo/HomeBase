import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import PersonaSprite from "./components/PersonaSprite.vue";
import { worldFixture } from "./fixtures/game";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configurePersonaRuntime } from "./stores/persona";
import { configureProgressRuntime } from "./stores/progress";

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

  it("saves, approves, reloads, and shows only the current persona in World", async () => {
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    configureProgressRuntime({ api: createFixtureProgressApi() });
    configurePersonaRuntime({ api: createFixturePersonaApi() });
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

    await router.push("/");
    await flushPromises();
    expect(wrapper.findAll(".world-scene .persona-control")).toHaveLength(1);
    expect(wrapper.text()).toContain("Pixel Edwin");
    expect(wrapper.text()).not.toContain("Vienna");
    expect(wrapper.get(".world-scene .persona-anchor").classes()).toContain("persona-outfit--berry");
    wrapper.unmount();
  });
});
