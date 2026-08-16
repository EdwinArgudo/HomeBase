import { describe, expect, it, vi } from "vitest";
import { createFixturePlansApi } from "./fixturePlans";
import { createHttpPlansApi, PlansApiError } from "./plans";

describe("plans API", () => {
  it("loads and posts closed same-origin plans snapshots", async () => {
    const fixture = createFixturePlansApi();
    const initial = await fixture.load();
    const changed = await fixture.act({ contractVersion: 1, action: "toggle_task", id: "task-dinners" });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(initial))).mockResolvedValueOnce(new Response(JSON.stringify(changed)));
    const api = createHttpPlansApi(fetcher);
    await expect(api.load()).resolves.toMatchObject({ contractVersion: 1 });
    await expect(api.act({ contractVersion: 1, action: "toggle_task", id: "task-dinners" })).resolves.toEqual(changed);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/plans", { credentials: "same-origin" });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/plans", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });

  it("does not fall back and hides unsafe server or contract payloads", async () => {
    const secret = "PLAN_SERVER_SECRET";
    const unsafe = createHttpPlansApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: secret, extra: true }), { status: 500 })));
    await expect(unsafe.load()).rejects.toEqual(new PlansApiError("Unable to load your plans."));
    const invalid = createHttpPlansApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ contractVersion: 1, tasks: [{ title: secret }] }))));
    await expect(invalid.load()).rejects.toEqual(new PlansApiError("The plans response could not be verified."));
  });
});
