import { describe, expect, it, vi } from "vitest";

import { createFixturePersonaApi } from "./fixturePersona";
import { createHttpPersonaApi, PersonaApiError } from "./persona";

describe("persona API", () => {
  it("uses same-origin authenticated endpoints and validates all responses", async () => {
    const fixture = createFixturePersonaApi();
    const loaded = await fixture.load();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(loaded)))
      .mockResolvedValueOnce(new Response(JSON.stringify(loaded.persona)))
      .mockResolvedValueOnce(new Response(JSON.stringify(await fixture.approve())));
    const api = createHttpPersonaApi(fetcher);
    expect((await api.load()).persona?.id).toBe("persona-edwin");
    await api.save({ contractVersion: 1, displayName: "Edwin", visibility: "household", appearance: loaded.persona!.appearance });
    await api.approve();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/personas/current");
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "PUT", credentials: "same-origin" });
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/personas/current/approve");
  });

  it("does not reflect arbitrary server payloads or accept malformed contracts", async () => {
    const secret = "D1_PERSONA_CLIENT_SECRET";
    const unsafe = createHttpPersonaApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: secret, extra: true }), { status: 500 })));
    await expect(unsafe.load()).rejects.toEqual(new PersonaApiError("Unable to load your persona."));
    const malformed = createHttpPersonaApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ persona: { id: secret } }))));
    await expect(malformed.load()).rejects.toEqual(new PersonaApiError("The persona response could not be verified."));
  });
});
