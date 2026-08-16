import type { RewardSnapshotV1 } from "@homebase/contracts";
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
  return { snapshot, loadState, loadError, ensureLoaded };
});
