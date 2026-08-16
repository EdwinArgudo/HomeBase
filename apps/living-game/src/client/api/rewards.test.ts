import { describe, expect, it, vi } from "vitest";

import { createFixtureRewardsApi } from "./fixtureRewards";
import { createHttpRewardsApi, RewardsApiError } from "./rewards";

describe("rewards API", () => {
  it("loads and validates the same-origin current-member reward snapshot", async () => {
    const fixture = await createFixtureRewardsApi().load();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    const snapshot = await createHttpRewardsApi(fetcher).load();
    expect(snapshot.rewards).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledWith("/api/game/rewards", { credentials: "same-origin" });
  });

  it("has no fixture fallback and safely handles server and contract failures", async () => {
    const secret = "REWARD_PRIVATE_SERVER_DETAIL";
    const unsafe = createHttpRewardsApi(vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: secret, extra: true }), { status: 500 }),
    ));
    await expect(unsafe.load()).rejects.toEqual(new RewardsApiError("Unable to load persona rewards."));

    const malformed = createHttpRewardsApi(vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ contractVersion: 1, rewards: [{ sourceEventId: secret }] })),
    ));
    await expect(malformed.load()).rejects.toEqual(new RewardsApiError("The rewards response could not be verified."));
  });
});
