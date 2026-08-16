import type { ProgressBalanceV1, ProgressSnapshotV1 } from "@homebase/contracts";
import { computed, ref } from "vue";
import { defineStore } from "pinia";

import type { ProgressApi } from "../api/progress";

const PERSONAL_DIMENSIONS = ["tend", "move", "grow", "connect"] as const;
type PersonalDimension = typeof PERSONAL_DIMENSIONS[number];

let runtime: { api: ProgressApi } | null = null;

export function configureProgressRuntime(configuration: { api: ProgressApi }) {
  runtime = configuration;
}

function configuredRuntime() {
  if (!runtime) throw new Error("Progress runtime has not been configured.");
  return runtime;
}

function safeMessage(error: unknown) {
  return error instanceof Error && error.message.length > 0 && error.message.length <= 200
    ? error.message
    : "Unable to load progress.";
}

function balanceKey(balance: ProgressBalanceV1) {
  return `${balance.memberId ?? "household"}:${balance.dimension}`;
}

function percentTowardNextLevel(balance: { lifetimePoints: number; level: number }) {
  return balance.level === 1_000 ? 100 : balance.lifetimePoints % 100;
}

export const useProgressStore = defineStore("progress", () => {
  const snapshot = ref<ProgressSnapshotV1 | null>(null);
  const loadState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loadError = ref("");
  const overlays = new Map<string, ProgressBalanceV1>();
  let requestSequence = 0;
  let pendingLoad: Promise<void> | null = null;

  function scopeAllows(balance: ProgressBalanceV1, current: ProgressSnapshotV1) {
    return balance.householdId === current.householdId
      && ((balance.memberId === current.member.id && balance.dimension !== "household")
        || (balance.memberId === null && balance.dimension === "household"));
  }

  function mergeIntoSnapshot(balance: ProgressBalanceV1) {
    const current = snapshot.value;
    if (!current || !scopeAllows(balance, current)) return;
    const key = balanceKey(balance);
    const index = current.balances.findIndex((candidate) => balanceKey(candidate) === key);
    const existing = current.balances[index];
    if (existing && Date.parse(existing.updatedAt) > Date.parse(balance.updatedAt)) return;
    const balances = [...current.balances];
    if (index >= 0) balances[index] = balance;
    else balances.push(balance);
    snapshot.value = { ...current, balances };
  }

  function mergeAuthoritativeBalances(balances: readonly ProgressBalanceV1[]) {
    for (const balance of balances) {
      const key = balanceKey(balance);
      const existing = overlays.get(key);
      if (!existing || Date.parse(existing.updatedAt) <= Date.parse(balance.updatedAt)) {
        overlays.set(key, balance);
      }
      mergeIntoSnapshot(balance);
    }
  }

  async function ensureLoaded(force = false) {
    if (!force && loadState.value === "ready") return;
    if (!force && pendingLoad) return pendingLoad;
    const sequence = ++requestSequence;
    loadState.value = "loading";
    loadError.value = "";
    const request = configuredRuntime().api.load().then((loaded) => {
      if (sequence !== requestSequence) return;
      snapshot.value = loaded;
      for (const balance of overlays.values()) mergeIntoSnapshot(balance);
      loadState.value = "ready";
    }).catch((error: unknown) => {
      if (sequence !== requestSequence) return;
      snapshot.value = null;
      loadState.value = "error";
      loadError.value = safeMessage(error);
    }).finally(() => {
      if (sequence === requestSequence) pendingLoad = null;
    });
    pendingLoad = request;
    return request;
  }

  const displayName = computed(() => snapshot.value?.member.displayName ?? "You");
  const personalBalances = computed(() => PERSONAL_DIMENSIONS.map((dimension) => {
    const persisted = snapshot.value?.balances.find((balance) => (
      balance.memberId === snapshot.value?.member.id && balance.dimension === dimension
    ));
    const lifetimePoints = persisted?.lifetimePoints ?? 0;
    const level = persisted?.level ?? 1;
    return {
      dimension,
      lifetimePoints,
      level,
      progressPercent: percentTowardNextLevel({ lifetimePoints, level }),
      persisted,
    };
  }));
  const personalTotalPoints = computed(() => personalBalances.value.reduce((total, balance) => total + balance.lifetimePoints, 0));
  const personaLevel = computed(() => Math.max(1, ...personalBalances.value.map((balance) => balance.level)));
  const householdBalance = computed(() => snapshot.value?.balances.find((balance) => balance.memberId === null && balance.dimension === "household") ?? null);
  const householdPoints = computed(() => householdBalance.value?.lifetimePoints ?? 0);
  const householdLevel = computed(() => householdBalance.value?.level ?? 1);
  const householdProgressPercent = computed(() => percentTowardNextLevel({ lifetimePoints: householdPoints.value, level: householdLevel.value }));

  return {
    snapshot,
    loadState,
    loadError,
    displayName,
    personalBalances,
    personalTotalPoints,
    personaLevel,
    householdBalance,
    householdPoints,
    householdLevel,
    householdProgressPercent,
    ensureLoaded,
    mergeAuthoritativeBalances,
  };
});

export type { PersonalDimension };
