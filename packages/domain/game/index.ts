import {
  MOVE_FAMILIES,
  parseDailyMove,
  parseGameEvent,
  type DailyMoveV1,
  type GameEventV1,
  type MoveFamily,
  type MoveReasonCode,
  type MoveSourceType,
  type OwnershipType,
  type Visibility,
} from "@homebase/contracts";

export const MOVE_POLICY_VERSION = 1 as const;
export const PROGRESSION_POLICY_VERSION = 1 as const;
export const PERSONAL_COMPLETION_POINTS = 10 as const;
export const HOUSEHOLD_COMPLETION_POINTS = 4 as const;

export type CompletionAwardV1 = {
  policyVersion: 1;
  family: MoveFamily;
  ownership: OwnershipType;
  personalPoints: 10;
  householdPoints: 0 | 4;
};

export function completionAwardV1(move: Pick<DailyMoveV1, "family" | "ownership">): CompletionAwardV1 {
  return {
    policyVersion: PROGRESSION_POLICY_VERSION,
    family: move.family,
    ownership: move.ownership,
    personalPoints: PERSONAL_COMPLETION_POINTS,
    householdPoints: move.ownership === "shared" ? HOUSEHOLD_COMPLETION_POINTS : 0,
  };
}

export function levelForLifetimePointsV1(lifetimePoints: number) {
  if (!Number.isSafeInteger(lifetimePoints) || lifetimePoints < 0) {
    throw new RangeError("Lifetime points must be a nonnegative safe integer.");
  }
  return Math.min(1_000, Math.floor(lifetimePoints / 100) + 1);
}

export function completedMoveEventV1(
  move: DailyMoveV1,
  occurredAt: string,
  createdAt = occurredAt,
): GameEventV1 {
  const award = completionAwardV1(move);
  return parseGameEvent({
    contractVersion: 1,
    id: move.id,
    householdId: move.householdId,
    memberId: move.memberId,
    eventType: "daily_move.completed",
    source: { type: "daily_move", id: move.id },
    visibility: move.visibility,
    payload: {
      version: 1,
      data: {
        family: award.family,
        ownership: award.ownership,
        personalPoints: award.personalPoints,
        householdPoints: award.householdPoints,
      },
    },
    idempotencyKey: `daily_move.completed:${move.id}:v1`,
    occurredAt,
    createdAt,
  });
}

export type MoveCandidateSignals = {
  urgency: number;
  uncertainty: number;
  dueSoon: number;
  preference: number;
  cooperative: number;
  comeback: number;
  effort: number;
  repetition: number;
};

export type MoveCandidate = {
  householdId: string;
  memberId: string | null;
  family: MoveFamily;
  ownership: OwnershipType;
  visibility: Visibility;
  source: { type: MoveSourceType; id: string };
  title: string;
  shortLabel: string;
  estimatedSeconds: number;
  eligible: boolean;
  signals: MoveCandidateSignals;
};

export type DailyMoveIdContext = {
  householdId: string;
  memberId: string;
  localDate: string;
  slot: 1 | 2 | 3;
  candidate: MoveCandidate;
};

export type SelectDailyMovesV1Input = {
  householdId: string;
  memberId: string;
  localDate: string;
  createdAt: string;
  candidates: readonly MoveCandidate[];
  minimumMode?: boolean;
  maxMoves?: number;
  recentSourceIds?: readonly string[];
  cooldownSourceIds?: readonly string[];
  createId: (context: DailyMoveIdContext) => string;
};

type RankedCandidate = {
  candidate: MoveCandidate;
  score: number;
  reason: Exclude<MoveReasonCode, "minimum_mode">;
  sourceKey: string;
};

const SIGNAL_WEIGHTS = {
  urgency: 1_000,
  uncertainty: 850,
  dueSoon: 700,
  preference: 550,
  cooperative: 500,
  comeback: 450,
} as const;

const REASON_PRIORITY = ["urgent", "uncertainty", "due_soon", "preference", "cooperative", "comeback"] as const;
const FAMILY_RANK = new Map(MOVE_FAMILIES.map((family, index) => [family, index]));

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isValidIdentifier(value: string) {
  return value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

export function isValidLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validSignal(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function sourceKey(candidate: MoveCandidate) {
  return `${candidate.source.type}:${candidate.source.id}`;
}

function sourceIsListed(candidate: MoveCandidate, values: ReadonlySet<string>) {
  return values.has(candidate.source.id) || values.has(sourceKey(candidate));
}

function isCandidateInScope(candidate: MoveCandidate, householdId: string, memberId: string) {
  if (!candidate.eligible || candidate.householdId !== householdId) return false;
  if (!isValidIdentifier(candidate.source.id)) return false;
  if (candidate.title.length < 1 || candidate.title.length > 120) return false;
  if (candidate.shortLabel.length < 1 || candidate.shortLabel.length > 40) return false;
  if (!Number.isInteger(candidate.estimatedSeconds) || candidate.estimatedSeconds < 1 || candidate.estimatedSeconds > 86_400) return false;
  if (!Object.values(candidate.signals).every(validSignal)) return false;

  if (candidate.ownership === "personal") {
    return candidate.memberId === memberId && candidate.visibility !== "display";
  }

  return (candidate.memberId === null || candidate.memberId === memberId)
    && candidate.visibility !== "private";
}

function dominantReason(signals: MoveCandidateSignals): Exclude<MoveReasonCode, "minimum_mode"> {
  const contributions: Array<[Exclude<MoveReasonCode, "minimum_mode">, number]> = [
    ["urgent", signals.urgency * SIGNAL_WEIGHTS.urgency],
    ["uncertainty", signals.uncertainty * SIGNAL_WEIGHTS.uncertainty],
    ["due_soon", signals.dueSoon * SIGNAL_WEIGHTS.dueSoon],
    ["preference", signals.preference * SIGNAL_WEIGHTS.preference],
    ["cooperative", signals.cooperative * SIGNAL_WEIGHTS.cooperative],
    ["comeback", signals.comeback * SIGNAL_WEIGHTS.comeback],
  ];
  contributions.sort((left, right) => right[1] - left[1]
    || REASON_PRIORITY.indexOf(left[0]) - REASON_PRIORITY.indexOf(right[0]));
  const dominant = contributions[0];
  return dominant && dominant[1] > 0 ? dominant[0] : "preference";
}

function rankCandidate(candidate: MoveCandidate, recentSources: ReadonlySet<string>): RankedCandidate {
  const positive = candidate.signals.urgency * SIGNAL_WEIGHTS.urgency
    + candidate.signals.uncertainty * SIGNAL_WEIGHTS.uncertainty
    + candidate.signals.dueSoon * SIGNAL_WEIGHTS.dueSoon
    + candidate.signals.preference * SIGNAL_WEIGHTS.preference
    + candidate.signals.cooperative * SIGNAL_WEIGHTS.cooperative
    + candidate.signals.comeback * SIGNAL_WEIGHTS.comeback;
  const negative = candidate.signals.effort * 200
    + candidate.signals.repetition * 300
    + (sourceIsListed(candidate, recentSources) ? 400 : 0);
  return {
    candidate,
    score: positive - negative,
    reason: dominantReason(candidate.signals),
    sourceKey: sourceKey(candidate),
  };
}

function compareRanked(left: RankedCandidate, right: RankedCandidate) {
  return right.score - left.score
    || REASON_PRIORITY.indexOf(left.reason) - REASON_PRIORITY.indexOf(right.reason)
    || (FAMILY_RANK.get(left.candidate.family) ?? 99) - (FAMILY_RANK.get(right.candidate.family) ?? 99)
    || compareText(left.sourceKey, right.sourceKey)
    || compareText(left.candidate.title, right.candidate.title)
    || compareText(left.candidate.shortLabel, right.candidate.shortLabel)
    || left.candidate.estimatedSeconds - right.candidate.estimatedSeconds
    || compareText(left.candidate.ownership, right.candidate.ownership)
    || compareText(left.candidate.visibility, right.candidate.visibility)
    || compareText(left.candidate.memberId ?? "", right.candidate.memberId ?? "");
}

function deterministicUniqueRanking(
  candidates: readonly MoveCandidate[],
  recentSources: ReadonlySet<string>,
) {
  const ranked = candidates.map((candidate) => rankCandidate(candidate, recentSources)).sort(compareRanked);
  const seen = new Set<string>();
  return ranked.filter((entry) => {
    if (seen.has(entry.sourceKey)) return false;
    seen.add(entry.sourceKey);
    return true;
  });
}

function diverseTop(ranked: readonly RankedCandidate[], maximum: number) {
  const selected: RankedCandidate[] = [];
  const selectedSources = new Set<string>();
  const selectedFamilies = new Set<MoveFamily>();

  for (const entry of ranked) {
    if (selected.length >= maximum) break;
    if (selectedFamilies.has(entry.candidate.family)) continue;
    selected.push(entry);
    selectedSources.add(entry.sourceKey);
    selectedFamilies.add(entry.candidate.family);
  }
  for (const entry of ranked) {
    if (selected.length >= maximum) break;
    if (selectedSources.has(entry.sourceKey)) continue;
    selected.push(entry);
    selectedSources.add(entry.sourceKey);
  }
  return selected;
}

export function selectDailyMovesV1(input: SelectDailyMovesV1Input): DailyMoveV1[] {
  if (!isValidIdentifier(input.householdId) || !isValidIdentifier(input.memberId)) return [];
  if (!isValidLocalDate(input.localDate)) return [];
  const configuredMaximum = Number.isInteger(input.maxMoves) ? input.maxMoves! : 3;
  const maximum = input.minimumMode ? 1 : Math.max(0, Math.min(3, configuredMaximum));
  if (maximum === 0) return [];

  const recentSources = new Set(input.recentSourceIds ?? []);
  const cooldownSources = new Set(input.cooldownSourceIds ?? []);
  const eligible = input.candidates.filter((candidate) => (
    isCandidateInScope(candidate, input.householdId, input.memberId)
    && !sourceIsListed(candidate, cooldownSources)
  ));
  const selected = diverseTop(deterministicUniqueRanking(eligible, recentSources), maximum);

  return selected.map((entry, index) => {
    const slot = (index + 1) as 1 | 2 | 3;
    return parseDailyMove({
      contractVersion: 1,
      id: input.createId({
        householdId: input.householdId,
        memberId: input.memberId,
        localDate: input.localDate,
        slot,
        candidate: entry.candidate,
      }),
      householdId: input.householdId,
      memberId: input.memberId,
      localDate: input.localDate,
      slot,
      family: entry.candidate.family,
      ownership: entry.candidate.ownership,
      visibility: entry.candidate.visibility,
      source: entry.candidate.source,
      title: entry.candidate.title,
      shortLabel: entry.candidate.shortLabel,
      estimatedSeconds: entry.candidate.estimatedSeconds,
      status: "active",
      selectionReasonCode: input.minimumMode ? "minimum_mode" : entry.reason,
      movePolicyVersion: MOVE_POLICY_VERSION,
      completedAt: null,
      createdAt: input.createdAt,
    });
  });
}
