import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import App from "./App.vue";
import { routes } from "./router";

const expectedHeadings = [
  ["/", "Our World"],
  ["/today", "Today’s Moves"],
  ["/adventures", "Adventures"],
  ["/persona", "My Persona"],
  ["/ledger", "The Ledger"],
  ["/display", "Apartment Display"],
] as const;

describe("client routes", () => {
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
});
