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

  it("equips and removes an emblem through closed PUT requests and trusts the returned snapshot", async () => {
    const fixtureApi = createFixtureRewardsApi();
    const initial = await fixtureApi.load();
    const removed = await fixtureApi.equip(null);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
      .mockResolvedValueOnce(new Response(JSON.stringify(removed)));
    const api = createHttpRewardsApi(fetcher);
    await expect(api.equip("first-tend")).resolves.toMatchObject({ equippedRewardKey: "first-tend" });
    await expect(api.equip(null)).resolves.toMatchObject({ equippedRewardKey: null });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/game/rewards/equip", {
      method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: 1, rewardKey: "first-tend" }),
    });
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
    const equipSecret = createHttpRewardsApi(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: secret, extra: true }), { status: 500 })));
    await expect(equipSecret.equip("first-tend")).rejects.toEqual(new RewardsApiError("Unable to update the equipped reward."));
  });
});
