import {
  parseRewardEquipInput,
  parseRewardSnapshot,
  type RewardKeyV1,
  type RewardSnapshotV1,
} from "@homebase/contracts";

export interface RewardsApi {
  load(): Promise<RewardSnapshotV1>;
  equip(rewardKey: RewardKeyV1 | null): Promise<RewardSnapshotV1>;
}
export class RewardsApiError extends Error { constructor(message: string) { super(message); this.name = "RewardsApiError"; } }

function safeError(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "Unable to load persona rewards.";
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "error")) return "Unable to load persona rewards.";
  const message = typeof record.error === "string" ? record.error.trim() : "";
  return message && message.length <= 200 && ![...message].some((character) => character.charCodeAt(0) < 32)
    ? message : "Unable to load persona rewards.";
}

export function createHttpRewardsApi(fetcher: typeof fetch = fetch): RewardsApi {
  async function snapshotFrom(response: Response, fallback: string) {
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new RewardsApiError(fallback); }
    if (!response.ok) {
      const message = safeError(payload);
      throw new RewardsApiError(message === "Unable to load persona rewards." ? fallback : message);
    }
    try { return parseRewardSnapshot(payload); } catch { throw new RewardsApiError("The rewards response could not be verified."); }
  }
  return {
    async load() {
      return snapshotFrom(await fetcher("/api/game/rewards", { credentials: "same-origin" }), "Unable to load persona rewards.");
    },
    async equip(rewardKey) {
      const input = parseRewardEquipInput({ contractVersion: 1, rewardKey });
      return snapshotFrom(await fetcher("/api/game/rewards/equip", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }), "Unable to update the equipped reward.");
    },
  };
}
