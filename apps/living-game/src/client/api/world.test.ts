import { describe, expect, it, vi } from "vitest";

import { createFixtureWorldApi } from "./fixtureWorld";
import { createHttpWorldApi, WorldApiError } from "./world";

describe("world API", () => {
  it("loads and validates the same-origin household projection", async () => {
    const fixture = await createFixtureWorldApi().load();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    const projection = await createHttpWorldApi(fetcher).load();
    expect(projection.personas).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith("/api/world", { credentials: "same-origin" });
  });

  it("has no fixture fallback and safely handles server and contract failures", async () => {
    const secret = "WORLD_PRIVATE_SERVER_DETAIL";
    const unsafe = createHttpWorldApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: secret, extra: true }), { status: 500 })));
    await expect(unsafe.load()).rejects.toEqual(new WorldApiError("Unable to load the household world."));
    const malformed = createHttpWorldApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ contractVersion: 1, personas: [{ secret }] }))));
    await expect(malformed.load()).rejects.toEqual(new WorldApiError("The household world response could not be verified."));
  });
});
