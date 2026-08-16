import { flushPromises, mount } from "@vue/test-utils";

// Home resolves the household first, so a mount settles over two rounds.
async function settle() {
  await flushPromises();
  await flushPromises();
}
import { parseProgressBalance, parseProgressSnapshot, type ProgressBalanceV1, type ProgressSnapshotV1 } from "@homebase/contracts";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import { createFixtureDailyMovesApi } from "./api/fixtureDailyMoves";
import { createFixturePersonaApi } from "./api/fixturePersona";
import { createFixtureRewardsApi } from "./api/fixtureRewards";
import { createFixtureWorldApi } from "./api/fixtureWorld";
import { createFixtureAdventuresApi } from "./api/adventures";
import { createFixtureHouseholdApi } from "./api/household";
import { routes } from "./router";
import { configureDailyMovesRuntime } from "./stores/dailyMoves";
import { configureProgressRuntime } from "./stores/progress";
import { configurePersonaRuntime } from "./stores/persona";
import { configureRewardsRuntime } from "./stores/rewards";
import { configureWorldRuntime } from "./stores/world";
import { configureAdventuresRuntime } from "./stores/adventures";
import { configureHouseholdRuntime } from "./stores/household";

function balance(overrides: Partial<ProgressBalanceV1> = {}) {
  return parseProgressBalance({
    contractVersion: 1,
    id: "progress-tend",
    householdId: "household-homebase",
    memberId: "member-edwin",
    dimension: "tend",
    lifetimePoints: 10,
    level: 1,
    updatedAt: "2026-08-15T11:00:00.000Z",
    ...overrides,
  });
}

function snapshot(balances: ProgressSnapshotV1["balances"] = []) {
  return parseProgressSnapshot({
    contractVersion: 1,
    householdId: "household-homebase",
    member: { id: "member-edwin", displayName: "Real Edwin" },
    balances,
    generatedAt: "2026-08-15T11:00:00.000Z",
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function mountAt(path: string) {
  configurePersonaRuntime({ api: createFixturePersonaApi() });
  configureRewardsRuntime({ api: createFixtureRewardsApi() });
  configureWorldRuntime({ api: createFixtureWorldApi() });
  configureHouseholdRuntime({ api: createFixtureHouseholdApi() });
    configureAdventuresRuntime({ api: createFixtureAdventuresApi() });
  const router = createRouter({ history: createMemoryHistory(), routes: [...routes] });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
  return { wrapper, router };
}

describe("live progress views", () => {
  it("shows Persona loading, safe error, Retry, and empty-zero states", async () => {
    const first = deferred<ProgressSnapshotV1>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot());
    configureProgressRuntime({ api: { load } });
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    const { wrapper } = await mountAt("/persona");

    await settle();
    expect(wrapper.get('.progress-state[role="status"]').text()).toContain("Loading your progress");
    first.reject(new Error("Please sign in again."));
    await settle();
    expect(wrapper.get('.progress-state[role="alert"]').text()).toContain("Please sign in again.");
    await wrapper.get('.progress-state[role="alert"] button').trigger("click");
    await settle();
    expect(wrapper.text()).toContain("No progress recorded yet");
    expect(wrapper.text()).toContain("Edwin");
    expect(wrapper.text()).toContain("Level 1 · 0 total points");
    wrapper.unmount();
  });

  it("shows accessible World progress loading and error states", async () => {
    const pending = deferred<ProgressSnapshotV1>();
    configureProgressRuntime({ api: { load: vi.fn().mockReturnValue(pending.promise) } });
    configureDailyMovesRuntime({ api: createFixtureDailyMovesApi(), now: () => new Date(2026, 7, 15) });
    const { wrapper } = await mountAt("/");

    expect(wrapper.get(".world-level").attributes("role")).toBe("status");
    expect(wrapper.get(".world-level").text()).toContain("Loading household progress");
    pending.reject(new Error("Progress is temporarily unavailable."));
    await settle();
    expect(wrapper.get(".world-level").attributes("role")).toBe("alert");
    expect(wrapper.get(".world-level").text()).toContain("Progress is temporarily unavailable.");
    wrapper.unmount();
  });

  it("updates World and Persona only from completion-returned balances", async () => {
    const personal = balance({ lifetimePoints: 20, updatedAt: "2026-08-15T12:00:00.000Z" });
    const household = balance({
      id: "progress-household",
      memberId: null,
      dimension: "household",
      lifetimePoints: 104,
      level: 2,
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
    configureProgressRuntime({
      api: { load: vi.fn().mockResolvedValue(snapshot([balance(), balance({ id: "household-start", memberId: null, dimension: "household", lifetimePoints: 100, level: 2 })])) },
    });
    const dailyApi = createFixtureDailyMovesApi();
    const fixtureComplete = dailyApi.complete.bind(dailyApi);
    dailyApi.complete = async (moveId, input) => {
      const result = await fixtureComplete(moveId, input);
      return { ...result, balances: [personal, household] };
    };
    configureDailyMovesRuntime({ api: dailyApi, now: () => new Date(2026, 7, 15) });
    const { wrapper, router } = await mountAt("/");
    await settle();

    expect(wrapper.get(".world-level").text()).toContain("100 points");
    expect(wrapper.get(".world-level__badge").text()).toBe("2");
    await wrapper.get(".move-list .action-button").trigger("click");
    await settle();
    expect(wrapper.get(".world-level").text()).toContain("104 points");

    await router.push("/persona");
    await settle();
    expect(wrapper.text()).toContain("Edwin");
    expect(wrapper.text()).toContain("20 total points");
    expect(wrapper.text()).toContain("tendLife admin & home · 20 points");
    expect(wrapper.text()).toContain("Saved ready persona");
    wrapper.unmount();
  });
});
