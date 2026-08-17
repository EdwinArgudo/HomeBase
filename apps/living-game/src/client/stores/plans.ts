import type { PlanGoalOwnership, PlanGoalTrackingType, PlansActionV1, PlansSnapshotV1 } from "@homebase/contracts";
import { defineStore } from "pinia";
import { ref } from "vue";
import type { PlansApi } from "../api/plans";

let runtime: { api: PlansApi } | null = null;
export function configurePlansRuntime(value: { api: PlansApi }) { runtime = value; }
function api() { if (!runtime) throw new Error("Plans runtime has not been configured."); return runtime.api; }

export const usePlansStore = defineStore("plans", () => {
  const snapshot = ref<PlansSnapshotV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const actionError = ref("");
  const feedback = ref("");
  const busyKeys = ref(new Set<string>());
  const actionBusy = ref(false);
  let pending: Promise<void> | null = null;

  async function ensureLoaded(force = false) {
    if (pending) return pending;
    if (!force && loadState.value === "ready") return;
    loadState.value = "loading"; loadError.value = "";
    pending = api().load().then((value) => { snapshot.value = value; loadState.value = "ready"; })
      .catch((error: unknown) => { snapshot.value = null; loadState.value = "error"; loadError.value = error instanceof Error ? error.message : "Unable to load your plans."; })
      .finally(() => { pending = null; });
    return pending;
  }

  /**
   * Writes run one at a time because each one returns a whole new snapshot and
   * the last reply would otherwise win. They queue rather than being dropped:
   * tapping two things quickly should do both, not silently ignore the second.
   *
   * Only the thing you touched is marked busy. Disabling the whole page on
   * every tap made one checkbox restyle every control on screen, which the
   * browser paid for by repainting all of it.
   */
  let queue: Promise<unknown> = Promise.resolve();

  async function act(action: PlansActionV1, key: string, message: string) {
    const run = queue.then(() => perform(action, key, message));
    queue = run.catch(() => undefined);
    return run;
  }

  async function perform(action: PlansActionV1, key: string, message: string) {
    actionBusy.value = true;
    busyKeys.value = new Set([...busyKeys.value, key]); actionError.value = ""; feedback.value = "";
    try {
      snapshot.value = await api().act(action);
      loadState.value = "ready"; feedback.value = message; return true;
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : "Unable to update your plans."; return false;
    } finally {
      const next = new Set(busyKeys.value); next.delete(key); busyKeys.value = next;
      actionBusy.value = next.size > 0;
    }
  }

  const isBusy = (key: string) => busyKeys.value.has(key);

  const toggleTask = (id: string) => act({ contractVersion: 1, action: "toggle_task", id }, `task:${id}`, "Task updated.");
  const toggleGrocery = (id: string) => act({ contractVersion: 1, action: "toggle_grocery", id }, `grocery:${id}`, "Grocery list updated.");
  const addGrocery = (text: string) => act({ contractVersion: 1, action: "add_grocery", text }, "grocery:add", "Added to the grocery list.");
  const logGoal = (id: string, value: number) => act({ contractVersion: 1, action: "log_goal", id, value }, `goal:${id}`, "Logged. Nice.");
  const retireGoal = (id: string) => act({ contractVersion: 1, action: "retire_goal", id }, `goal:${id}`, "Goal finished. What you did stays counted.");
  const addGoal = (goal: { text: string; ownership: PlanGoalOwnership; trackingType: PlanGoalTrackingType; targetValue: number }) =>
    act({ contractVersion: 1, action: "add_goal", ...goal }, "goal:add", "Goal added.");
  return {
    snapshot, loadState, loadError, actionError, feedback, busyKeys, actionBusy, isBusy, ensureLoaded,
    toggleTask, toggleGrocery, addGrocery, logGoal, retireGoal, addGoal,
  };
});
