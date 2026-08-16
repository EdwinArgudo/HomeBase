import { parsePlansSnapshot, type PlansActionV1, type PlanTaskV1 } from "@homebase/contracts";
import type { PlansApi } from "./plans";

export function createFixturePlansApi(): PlansApi {
  let tasks: PlanTaskV1[] = [
    { id: "task-dinners", title: "Plan this week’s dinners", status: "open" as const, dueDate: null, owner: "together" as const },
    { id: "task-recycling", title: "Take recycling downstairs", status: "open" as const, dueDate: null, owner: "you" as const },
  ];
  let groceries = [{ id: "grocery-oats", name: "Oats", checked: false }];
  const goals = [
    { id: "goal-language", name: "Practice Spanish", ownership: "personal" as const, trackingType: "sessions" as const, targetValue: 12, minimumValue: 1, currentValue: 3 },
    { id: "goal-fund", name: "Household fund", ownership: "shared" as const, trackingType: "amount" as const, targetValue: 10000, minimumValue: 1000, currentValue: 4000 },
  ];
  const snapshot = () => parsePlansSnapshot({ contractVersion: 1, tasks, groceries, goals, generatedAt: new Date().toISOString() });
  return {
    async load() { return snapshot(); },
    async act(action: PlansActionV1) {
      if (action.action === "toggle_task") tasks = tasks.map((item) => item.id === action.id ? { ...item, status: item.status === "open" ? "complete" : "open" } : item);
      else if (action.action === "toggle_grocery") groceries = groceries.map((item) => item.id === action.id ? { ...item, checked: !item.checked } : item);
      else groceries = [...groceries, { id: `grocery-${groceries.length + 1}`, name: action.text, checked: false }];
      return snapshot();
    },
  };
}
