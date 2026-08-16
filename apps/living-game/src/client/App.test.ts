import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";

const expectedHeadings = [
  ["/", "Our World"],
  ["/today", "Today’s Moves"],
  ["/adventures", "Adventures"],
  ["/persona", "My Persona"],
  ["/ledger", "The Ledger"],
  ["/display", "Apartment Display"],
] as const;

describe("client routes", () => {
  beforeEach(() => {
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
  });

  it.each(expectedHeadings)("renders %s with its accessible heading", async (path, heading) => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [...routes],
    });

    await testRouter.push(path);
    await testRouter.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), testRouter],
      },
    });

    expect(wrapper.get("h1").text()).toBe(heading);
    wrapper.unmount();
  });

  it("keeps the fixture preview disclosure and legacy Homebase exit visible across routes", async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [...routes],
    });
    await testRouter.push("/persona");
    await testRouter.isReady();

    const wrapper = mount(App, {
      global: { plugins: [createPinia(), testRouter] },
    });

    expect(wrapper.get(".preview-badge").text()).toBe("Preview");
    expect(wrapper.get(".preview-context").text()).toContain("Fixture data");
    expect(wrapper.get("a.back-to-homebase").attributes("href")).toBe("/");
    expect(wrapper.get("a.back-to-homebase").text()).toBe("Current Homebase");
    wrapper.unmount();
  });

  it("shares one in-flight move load across World and Today route transitions", async () => {
    let resolveLoad!: (value: []) => void;
    const load = new Promise<[]>((resolve) => { resolveLoad = resolve; });
    let calls = 0;
    configureDailyMovesRuntime({
      now: () => new Date(2026, 7, 15),
      api: {
        load: async () => { calls += 1; return load; },
        complete: async () => { throw new Error("unused"); },
        defer: async () => { throw new Error("unused"); },
        replace: async () => { throw new Error("unused"); },
        options: async () => { throw new Error("unused"); },
      },
    });
    const testRouter = createRouter({ history: createMemoryHistory(), routes: [...routes] });
    await testRouter.push("/");
    await testRouter.isReady();
    const wrapper = mount(App, { global: { plugins: [createPinia(), testRouter] } });

    expect(wrapper.get('[role="status"]').text()).toContain("Loading");
    await testRouter.push("/today");
    await flushPromises();
    expect(calls).toBe(1);
    resolveLoad([]);
    await flushPromises();
    expect(wrapper.text()).toContain("No moves for today");
    wrapper.unmount();
  });
});
