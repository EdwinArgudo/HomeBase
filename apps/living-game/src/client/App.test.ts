import { flushPromises, mount } from "@vue/test-utils";

// Home resolves the household first, so a mount settles over two rounds.
async function settle() {
  await flushPromises();
  await flushPromises();
}
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixtureProgressApi } from "./api/fixtureProgress";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { createFixtureDisplayWorldApi } from "./api/displayWorld";
import { createFixturePlaidLinkLauncher } from "./api/plaidLink";
import { createFixtureLedgerApi } from "./api/ledger";
import { createFixtureHouseholdApi } from "./api/household";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configureRewardsRuntime } from "./stores/rewards";
import { configurePersonaRuntime } from "./stores/persona";
import { configureWorldRuntime } from "./stores/world";
import { configureDisplayWorldRuntime } from "./stores/displayWorld";
import { configureLedgerRuntime } from "./stores/ledger";
import { configureHouseholdRuntime } from "./stores/household";

const expectedHeadings = [
  ["/", "Our World"],
  ["/adventures", "Adventures"],
  ["/household", "Your household"],
  ["/persona", "My Persona"],
  ["/ledger", "The Ledger"],
  ["/display", "Edwin and Vienna are home"],
] as const;

describe("client routes", () => {
  beforeEach(() => {
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    configureProgressRuntime({ api: createFixtureProgressApi() });
    configureRewardsRuntime({ api: createFixtureRewardsApi() });
    configurePersonaRuntime({ api: createFixturePersonaApi() });
    configureWorldRuntime({ api: createFixtureWorldApi() });
    configureDisplayWorldRuntime({ api: createFixtureDisplayWorldApi() });
    configureLedgerRuntime({ api: createFixtureLedgerApi(), openPlaidLink: createFixturePlaidLinkLauncher() });
    configureHouseholdRuntime({ api: createFixtureHouseholdApi() });
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

    await settle();
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

  it("shares one in-flight move load across route transitions", async () => {
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
    await testRouter.push("/persona");
    await testRouter.push("/");
    await settle();
    expect(calls).toBe(1);
    resolveLoad([]);
    await settle();
    expect(wrapper.text()).toContain("Nothing needs you today");
    wrapper.unmount();
  });
});
