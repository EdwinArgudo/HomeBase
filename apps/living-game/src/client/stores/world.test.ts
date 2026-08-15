import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useWorldStore } from "./world";

describe("world store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("selects only personas contained in the current projection", () => {
    const store = useWorldStore();
    const initialId = store.selectedPersonaId;
    const secondId = store.projection.personas[1]?.id;

    expect(secondId).toBeTruthy();
    store.selectPersona(secondId!);
    expect(store.selectedPersonaId).toBe(secondId);
    expect(store.selectedPersona?.id).toBe(secondId);

    store.selectPersona("persona-from-another-household");
    expect(store.selectedPersonaId).toBe(secondId);
    expect(store.selectedPersonaId).not.toBe(initialId);
  });
});
