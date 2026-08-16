import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFixtureAdventuresApi } from "./api/adventures";
import { configureAdventuresRuntime } from "./stores/adventures";
import AdventuresView from "./views/AdventuresView.vue";

describe("adventures", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("offers one to begin, and starts it with the template it came from", async () => {
    const api = createFixtureAdventuresApi();
    const accept = vi.spyOn(api, "accept");
    configureAdventuresRuntime({ api });

    const wrapper = mount(AdventuresView);
    await flushPromises();
    expect(wrapper.text()).toContain("On offer this week");

    await wrapper.get(".adventure-card .action-button").trigger("click");
    await flushPromises();

    expect(accept).toHaveBeenCalledWith("dinners-together");
    expect(wrapper.text()).toContain("This week · together");
    // Beginning one takes the offer away; a household runs one at a time.
    expect(wrapper.text()).not.toContain("On offer this week");
    wrapper.unmount();
  });

  it("says the shared moves do the work, with nothing to tick off", async () => {
    const api = createFixtureAdventuresApi();
    configureAdventuresRuntime({ api });
    const wrapper = mount(AdventuresView);
    await flushPromises();
    await wrapper.get(".adventure-card .action-button").trigger("click");
    await flushPromises();

    const progress = wrapper.get('[role="progressbar"]');
    expect(progress.attributes("aria-valuenow")).toBe("1");
    expect(progress.attributes("aria-valuemax")).toBe("3");
    expect(wrapper.text()).toContain("nothing to tick off");
    expect(wrapper.findAll(".adventure-card button")).toHaveLength(0);
    wrapper.unmount();
  });

  it("reads a week that ran out as over, not as failed", async () => {
    const api = createFixtureAdventuresApi();
    const snapshot = await api.load();
    vi.spyOn(api, "load").mockResolvedValue({
      ...snapshot,
      finished: [{ ...snapshot.finished[0]!, status: "expired", currentValue: 1 }],
    });
    configureAdventuresRuntime({ api });

    const wrapper = mount(AdventuresView);
    await flushPromises();
    expect(wrapper.text()).toContain("ran out of week");
    expect(wrapper.text()).toContain("Nothing is lost");
    expect(wrapper.text()).not.toMatch(/fail|missed|behind schedule/i);
    wrapper.unmount();
  });

  it("surfaces a refusal without losing what is on screen", async () => {
    const api = createFixtureAdventuresApi();
    vi.spyOn(api, "accept").mockRejectedValue(new Error("A different adventure is on offer this week."));
    configureAdventuresRuntime({ api });

    const wrapper = mount(AdventuresView);
    await flushPromises();
    await wrapper.get(".adventure-card .action-button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("A different adventure is on offer");
    expect(wrapper.text()).toContain("On offer this week");
    wrapper.unmount();
  });
});
