import {
  arrayAt,
  booleanAt,
  enumAt,
  fail,
  idAt,
  integerAt,
  localDateAt,
  objectAt,
  required,
  stringAt,
  timestampAt,
  uniqueBy,
  versionAt,
} from "./primitives.ts";

export const PLAN_TASK_STATUSES = ["open", "complete"] as const;
export const PLAN_OWNERS = ["together", "you"] as const;
export const PLAN_GOAL_OWNERSHIPS = ["shared", "personal"] as const;
export const PLAN_GOAL_TRACKING_TYPES = ["sessions", "amount"] as const;

export type PlanTaskStatus = typeof PLAN_TASK_STATUSES[number];
export type PlanOwner = typeof PLAN_OWNERS[number];
export type PlanGoalOwnership = typeof PLAN_GOAL_OWNERSHIPS[number];
export type PlanGoalTrackingType = typeof PLAN_GOAL_TRACKING_TYPES[number];

export type PlanTaskV1 = { id: string; title: string; status: PlanTaskStatus; dueDate: string | null; owner: PlanOwner };
export type PlanGroceryV1 = { id: string; name: string; checked: boolean };
export type PlanGoalV1 = {
  id: string;
  name: string;
  ownership: PlanGoalOwnership;
  trackingType: PlanGoalTrackingType;
  targetValue: number;
  minimumValue: number | null;
  currentValue: number;
};
export type PlansSnapshotV1 = { contractVersion: 1; tasks: PlanTaskV1[]; groceries: PlanGroceryV1[]; goals: PlanGoalV1[]; generatedAt: string };
export type PlansActionV1 =
  | { contractVersion: 1; action: "toggle_task"; id: string }
  | { contractVersion: 1; action: "toggle_grocery"; id: string }
  | { contractVersion: 1; action: "add_grocery"; text: string }
  | { contractVersion: 1; action: "log_goal"; id: string; value: number }
  | { contractVersion: 1; action: "retire_goal"; id: string }
  | {
    contractVersion: 1;
    action: "add_goal";
    text: string;
    ownership: PlanGoalOwnership;
    trackingType: PlanGoalTrackingType;
    targetValue: number;
  };

function planTaskAt(input: unknown, path: string): PlanTaskV1 {
  const record = objectAt(input, path, ["id", "title", "status", "dueDate", "owner"]);
  const dueDate = required(record, "dueDate", path);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    title: stringAt(required(record, "title", path), `${path}.title`, 1, 160),
    status: enumAt(required(record, "status", path), `${path}.status`, PLAN_TASK_STATUSES),
    dueDate: dueDate === null ? null : localDateAt(dueDate, `${path}.dueDate`),
    owner: enumAt(required(record, "owner", path), `${path}.owner`, PLAN_OWNERS),
  };
}

function planGroceryAt(input: unknown, path: string): PlanGroceryV1 {
  const record = objectAt(input, path, ["id", "name", "checked"]);
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    name: stringAt(required(record, "name", path), `${path}.name`, 1, 120),
    checked: booleanAt(required(record, "checked", path), `${path}.checked`),
  };
}

function planGoalAt(input: unknown, path: string): PlanGoalV1 {
  const record = objectAt(input, path, ["id", "name", "ownership", "trackingType", "targetValue", "minimumValue", "currentValue"]);
  const minimum = required(record, "minimumValue", path);
  const targetValue = integerAt(required(record, "targetValue", path), `${path}.targetValue`, 1, Number.MAX_SAFE_INTEGER);
  const minimumValue = minimum === null ? null : integerAt(minimum, `${path}.minimumValue`, 1, Number.MAX_SAFE_INTEGER);
  if (minimumValue !== null && minimumValue > targetValue) fail(`${path}.minimumValue`, "must not exceed targetValue");
  return {
    id: idAt(required(record, "id", path), `${path}.id`),
    name: stringAt(required(record, "name", path), `${path}.name`, 1, 160),
    ownership: enumAt(required(record, "ownership", path), `${path}.ownership`, PLAN_GOAL_OWNERSHIPS),
    trackingType: enumAt(required(record, "trackingType", path), `${path}.trackingType`, PLAN_GOAL_TRACKING_TYPES),
    targetValue,
    minimumValue,
    currentValue: integerAt(required(record, "currentValue", path), `${path}.currentValue`, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function parsePlansSnapshot(input: unknown): PlansSnapshotV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "tasks", "groceries", "goals", "generatedAt"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const tasks = arrayAt(required(record, "tasks", path), "$.tasks", 0, 500).map((entry, index) => planTaskAt(entry, `$.tasks[${index}]`));
  const groceries = arrayAt(required(record, "groceries", path), "$.groceries", 0, 500).map((entry, index) => planGroceryAt(entry, `$.groceries[${index}]`));
  const goals = arrayAt(required(record, "goals", path), "$.goals", 0, 100).map((entry, index) => planGoalAt(entry, `$.goals[${index}]`));
  uniqueBy(tasks, (entry) => entry.id, "$.tasks", "id");
  uniqueBy(groceries, (entry) => entry.id, "$.groceries", "id");
  uniqueBy(goals, (entry) => entry.id, "$.goals", "id");
  return { contractVersion: 1, tasks, groceries, goals, generatedAt: timestampAt(required(record, "generatedAt", path), "$.generatedAt") };
}

export function parsePlansAction(input: unknown): PlansActionV1 {
  const path = "$";
  const record = objectAt(input, path, ["contractVersion", "action", "id", "text", "value", "ownership", "trackingType", "targetValue"]);
  versionAt(required(record, "contractVersion", path), "$.contractVersion", 1);
  const action = enumAt(required(record, "action", path), "$.action",
    ["toggle_task", "toggle_grocery", "add_grocery", "log_goal", "retire_goal", "add_goal"] as const);

  const rejectAllBut = (allowed: readonly string[]) => {
    for (const key of ["id", "text", "value", "ownership", "trackingType", "targetValue"]) {
      if (key in record && !allowed.includes(key)) fail(`$.${key}`, `is not allowed for ${action}`, "unknown_field");
    }
  };

  if (action === "add_grocery") {
    rejectAllBut(["text"]);
    const text = stringAt(required(record, "text", path), "$.text", 1, 120).trim();
    if (!text) fail("$.text", "must contain visible text");
    return { contractVersion: 1, action, text };
  }

  if (action === "add_goal") {
    rejectAllBut(["text", "ownership", "trackingType", "targetValue"]);
    const text = stringAt(required(record, "text", path), "$.text", 1, 160).trim();
    if (!text) fail("$.text", "must contain visible text");
    return {
      contractVersion: 1,
      action,
      text,
      ownership: enumAt(required(record, "ownership", path), "$.ownership", PLAN_GOAL_OWNERSHIPS),
      trackingType: enumAt(required(record, "trackingType", path), "$.trackingType", PLAN_GOAL_TRACKING_TYPES),
      targetValue: integerAt(required(record, "targetValue", path), "$.targetValue", 1, 1_000_000_000),
    };
  }

  if (action === "log_goal") {
    rejectAllBut(["id", "value"]);
    return {
      contractVersion: 1,
      action,
      id: idAt(required(record, "id", path), "$.id"),
      value: integerAt(required(record, "value", path), "$.value", 1, 1_000_000),
    };
  }

  rejectAllBut(["id"]);
  return { contractVersion: 1, action, id: idAt(required(record, "id", path), "$.id") };
}
