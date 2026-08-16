import type { RewardKeyV1, RewardSnapshotV1 } from "@homebase/contracts";
import { ref } from "vue";
import { defineStore } from "pinia";

import type { RewardsApi } from "../api/rewards";

let runtime: { api: RewardsApi } | null = null;
export function configureRewardsRuntime(configuration: { api: RewardsApi }) { runtime = configuration; }
function api() { if (!runtime) throw new Error("Rewards runtime has not been configured."); return runtime.api; }

export const useRewardsStore = defineStore("rewards", () => {
  const snapshot = ref<RewardSnapshotV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const actionState = ref<"idle" | "equipping">("idle");
  const actionError = ref("");
  const feedback = ref("");
  let pending: Promise<void> | null = null;
  let sequence = 0;

  async function ensureLoaded(force = false) {
    if (pending) return pending;
    if (!force && loadState.value === "ready") return;
    const current = ++sequence;
    loadState.value = "loading"; loadError.value = "";
    const request = api().load().then((loaded) => {
      if (current !== sequence) return;
      snapshot.value = loaded; loadState.value = "ready";
    }).catch((error: unknown) => {
      if (current !== sequence) return;
      snapshot.value = null; loadState.value = "error";
      loadError.value = error instanceof Error && error.message.length <= 200 ? error.message : "Unable to load persona rewards.";
    }).finally(() => { if (current === sequence) pending = null; });
    pending = request;
    return request;
  }

  async function equip(rewardKey: RewardKeyV1 | null) {
    if (actionState.value !== "idle") return false;
    actionState.value = "equipping";
    actionError.value = "";
    feedback.value = "";
    try {
      snapshot.value = await api().equip(rewardKey);
      loadState.value = "ready";
      feedback.value = rewardKey === null ? "Emblem removed." : "Emblem equipped.";
      return true;
    } catch (error) {
      actionError.value = error instanceof Error && error.message.length <= 200
        ? error.message
        : "Unable to update the equipped reward.";
      return false;
    } finally {
      actionState.value = "idle";
    }
  }
  return { snapshot, loadState, loadError, actionState, actionError, feedback, ensureLoaded, equip };
});
