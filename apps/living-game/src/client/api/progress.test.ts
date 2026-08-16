import { describe, expect, it, vi } from "vitest";

import { createHttpProgressApi } from "./progress";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const emptySnapshot = {
  contractVersion: 1,
  householdId: "household-a",
  member: { id: "member-a", displayName: "Edwin" },
  balances: [],
  generatedAt: "2026-08-15T12:00:00.000Z",
};

describe("progress HTTP API", () => {
  it("loads and validates the exact same-origin progress snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(emptySnapshot));
    const result = await createHttpProgressApi(fetcher).load();
    expect(fetcher).toHaveBeenCalledWith("/api/game/progress", { credentials: "same-origin" });
    expect(result).toEqual(emptySnapshot);

    fetcher.mockResolvedValueOnce(response({ ...emptySnapshot, member: { ...emptySnapshot.member, email: "private@example.com" } }));
    await expect(createHttpProgressApi(fetcher).load()).rejects.toThrow("could not be verified");
  });

  it("never reflects an arbitrary error payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: "D1_SECRET", detail: "storage" }, 500));
    await expect(createHttpProgressApi(fetcher).load()).rejects.toThrow("Unable to load progress.");
  });
});
