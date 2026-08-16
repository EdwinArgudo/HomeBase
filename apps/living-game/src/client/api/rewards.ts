import { parseRewardSnapshot, type RewardSnapshotV1 } from "@homebase/contracts";

export interface RewardsApi { load(): Promise<RewardSnapshotV1>; }
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
  return { async load() {
    const response = await fetcher("/api/game/rewards", { credentials: "same-origin" });
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new RewardsApiError("Unable to load persona rewards."); }
    if (!response.ok) throw new RewardsApiError(safeError(payload));
    try { return parseRewardSnapshot(payload); } catch { throw new RewardsApiError("The rewards response could not be verified."); }
  } };
}
