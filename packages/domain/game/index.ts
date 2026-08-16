import {
  MOVE_FAMILIES,
  PROGRESS_DIMENSIONS,
  parseDailyMove,
  parseGameEvent,
  type DailyMoveV1,
  type GameEventV1,
  type MoveFamily,
  type MoveReasonCode,
  type MoveSourceType,
  type OwnershipType,
  type PersonaActivityState,
  type ProgressDimension,
  type RewardDefinitionV1,
  type RewardKeyV1,
  type Visibility,
} from "@homebase/contracts";

export const MOVE_POLICY_VERSION = 1 as const;
export const PROGRESSION_POLICY_VERSION = 1 as const;
export const PERSONAL_COMPLETION_POINTS = 10 as const;
export const HOUSEHOLD_COMPLETION_POINTS = 4 as const;
export const REWARD_CATALOG_VERSION = 1 as const;
export const REWARD_POLICY_VERSION = 1 as const;

export type RewardPointTotalsV1 = Record<ProgressDimension, number>;

export const REWARD_CATALOG_V1: readonly RewardDefinitionV1[] = Object.freeze(([
  { catalogVersion: 1, key: "first-tend", kind: "emblem", title: "Steady Hands", description: "A calm first step in tending everyday life.", dimension: "tend", thresholdPoints: 10 },
  { catalogVersion: 1, key: "first-move", kind: "emblem", title: "Gentle Motion", description: "A first bit of energy put toward feeling well.", dimension: "move", thresholdPoints: 10 },
  { catalogVersion: 1, key: "first-grow", kind: "emblem", title: "New Leaf", description: "A first moment invested in learning and growth.", dimension: "grow", thresholdPoints: 10 },
  { catalogVersion: 1, key: "first-connect", kind: "emblem", title: "Warm Hello", description: "A first intentional moment of connection.", dimension: "connect", thresholdPoints: 10 },
  { catalogVersion: 1, key: "first-household", kind: "emblem", title: "Shared Spark", description: "A first shared move that helped the household together.", dimension: "household", thresholdPoints: 4 },
  { catalogVersion: 1, key: "home-lamp", kind: "furnishing", title: "Corner Lamp", description: "A warm light for the evenings you spend in.", dimension: "household", thresholdPoints: 8 },
  { catalogVersion: 1, key: "home-art", kind: "furnishing", title: "Framed Print", description: "Something on the wall that is yours.", dimension: "household", thresholdPoints: 20 },
  { catalogVersion: 1, key: "home-cushion", kind: "furnishing", title: "Floor Cushion", description: "Somewhere soft to land.", dimension: "household", thresholdPoints: 40 },
  { catalogVersion: 1, key: "home-lights", kind: "furnishing", title: "String Lights", description: "The room feels like a celebration now.", dimension: "household", thresholdPoints: 70 },
] satisfies RewardDefinitionV1[]).map((reward) => Object.freeze(reward)));

/**
 * Where each earned furnishing sits. Placement is fixed so the home looks the
 * same to both members and rebuilds identically from the same unlocks.
 */
export const FURNISHING_PLACEMENTS_V1 = Object.freeze({
  "home-lamp": { catalogKey: "corner-lamp", zone: "living-room", x: 62, y: 50, zIndex: 2 },
  "home-art": { catalogKey: "framed-print", zone: "living-room", x: 40, y: 22, zIndex: 1 },
  "home-cushion": { catalogKey: "floor-cushion", zone: "living-room", x: 16, y: 82, zIndex: 3 },
  "home-lights": { catalogKey: "string-lights", zone: "living-room", x: 50, y: 8, zIndex: 1 },
} as const);

export const FURNISHING_REWARDS_V1: readonly RewardDefinitionV1[] = Object.freeze(
  REWARD_CATALOG_V1.filter((reward) => reward.kind === "furnishing"),
);

/** Only emblems are worn by a companion; furnishings belong to the home. */
export const EMBLEM_REWARD_KEYS_V1: readonly RewardKeyV1[] = Object.freeze(
  REWARD_CATALOG_V1.filter((reward) => reward.kind === "emblem").map((reward) => reward.key),
);

export function isEmblemRewardKeyV1(value: unknown): value is RewardKeyV1 {
  return EMBLEM_REWARD_KEYS_V1.includes(value as RewardKeyV1);
}

/** Furnishings the household has earned, in catalogue order. */
export function unlockedFurnishingsV1(householdPoints: number): readonly RewardDefinitionV1[] {
  if (!Number.isSafeInteger(householdPoints) || householdPoints < 0) {
    throw new RangeError("Household points must be a nonnegative safe integer.");
  }
  return FURNISHING_REWARDS_V1.filter((reward) => householdPoints >= reward.thresholdPoints);
}

function assertRewardPointTotals(input: RewardPointTotalsV1) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Reward point totals must be an object.");
  }
  const keys = Object.keys(input).sort();
  const expected = [...PROGRESS_DIMENSIONS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("Reward point totals must contain exactly the supported dimensions.");
  }
  for (const dimension of PROGRESS_DIMENSIONS) {
    const value = input[dimension];
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Reward point totals must be nonnegative safe integers.");
  }
}

export function eligibleRewardsV1(input: RewardPointTotalsV1): readonly RewardDefinitionV1[] {
  assertRewardPointTotals(input);
  return REWARD_CATALOG_V1.filter((reward) => input[reward.dimension] >= reward.thresholdPoints);
}

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

export const COMPANION_CELEBRATE_MINUTES = 90 as const;
export const COMPANION_ACTIVE_HOURS = 20 as const;
export const COMPANION_RESTING_DAYS = 4 as const;

export type CompanionActivityInputV1 = {
  generatedAt: string;
  lastCompletion: { family: MoveFamily; occurredAt: string } | null;
};

/**
 * What a companion is doing, derived only from completed moves the viewer is
 * allowed to see. Resting is the quiet state after time away — it is never a
 * penalty, and nothing here can produce a distressed or diminished companion.
 */
export function companionActivityV1(input: CompanionActivityInputV1): PersonaActivityState {
  if (!input.lastCompletion) return "rest";

  const now = Date.parse(input.generatedAt);
  const then = Date.parse(input.lastCompletion.occurredAt);
  if (!Number.isFinite(now) || !Number.isFinite(then)) return "idle";

  const minutes = (now - then) / 60_000;
  // A completion recorded ahead of the projection clock still reads as fresh.
  if (minutes < COMPANION_CELEBRATE_MINUTES) return "celebrate";
  if (minutes < COMPANION_ACTIVE_HOURS * 60) return input.lastCompletion.family;
  if (minutes < COMPANION_RESTING_DAYS * 24 * 60) return "idle";
  return "rest";
}

export const COMEBACK_AWAY_DAYS = 4 as const;
export const COMEBACK_MAX_SECONDS = 120 as const;

/**
 * Marks the gentlest candidates so a returning member is offered one short way
 * back in. Nothing is removed and nothing is owed: this only changes which
 * single move rises to the top on the day someone comes back.
 */
export function comebackCandidatesV1(candidates: readonly MoveCandidate[]): readonly MoveCandidate[] {
  const gentle = candidates.filter((candidate) => candidate.eligible
    && candidate.estimatedSeconds <= COMEBACK_MAX_SECONDS);
  const preferred = new Set(gentle.length > 0 ? gentle : candidates.filter((candidate) => candidate.eligible));
  return candidates.map((candidate) => (preferred.has(candidate)
    ? { ...candidate, signals: { ...candidate.signals, comeback: 1 } }
    : candidate));
}

/** Whole days between two local calendar dates, or null if either is unusable. */
export function localDaysBetweenV1(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export const ADVENTURE_LENGTH_DAYS = 7 as const;

export type AdventureTemplateV1 = {
  key: string;
  title: string;
  description: string;
  family: MoveFamily;
  targetValue: number;
};

/**
 * Weekly adventures, one per way of growing. Each is finished by shared moves
 * the household was going to make anyway — an adventure names a week's effort
 * rather than asking for extra.
 */
export const ADVENTURE_TEMPLATES_V1: readonly AdventureTemplateV1[] = Object.freeze(([
  { key: "dinners-together", title: "Three dinners together", description: "Cook, order, or reheat — sitting down together is the point.", family: "connect", targetValue: 3 },
  { key: "tend-the-home", title: "Five small tidies", description: "Five shared bits of upkeep, none of them heroic.", family: "tend", targetValue: 5 },
  { key: "move-together", title: "Four moves together", description: "Walks count. So does dancing in the kitchen.", family: "move", targetValue: 4 },
  { key: "learn-together", title: "Three things learned", description: "Any three shared moments of practice.", family: "grow", targetValue: 3 },
] satisfies AdventureTemplateV1[]).map((template) => Object.freeze(template)));

export function adventureTemplateV1(key: string): AdventureTemplateV1 | null {
  return ADVENTURE_TEMPLATES_V1.find((template) => template.key === key) ?? null;
}

/**
 * Which adventure is on offer, rotating weekly. Deterministic from the date so
 * both members are always looking at the same offer.
 */
export function offeredAdventureTemplateV1(localDate: string): AdventureTemplateV1 {
  const days = Math.floor(Date.parse(`${localDate}T00:00:00.000Z`) / 86_400_000);
  const week = Number.isFinite(days) ? Math.floor(days / 7) : 0;
  const index = ((week % ADVENTURE_TEMPLATES_V1.length) + ADVENTURE_TEMPLATES_V1.length) % ADVENTURE_TEMPLATES_V1.length;
  return ADVENTURE_TEMPLATES_V1[index]!;
}

export function adventureEndsAtV1(startsAt: string): string {
  return new Date(Date.parse(startsAt) + ADVENTURE_LENGTH_DAYS * 86_400_000).toISOString();
}

/** An adventure is finished when its shared contributions reach the target. */
export function adventureIsCompleteV1(template: AdventureTemplateV1, contributions: number): boolean {
  return contributions >= template.targetValue;
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
  /** A day someone returns after time away: one short move, named as such. */
  comeback?: boolean;
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
  const maximum = input.minimumMode || input.comeback ? 1 : Math.max(0, Math.min(3, configuredMaximum));
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
      selectionReasonCode: input.minimumMode
        ? "minimum_mode"
        : input.comeback ? "comeback" : entry.reason,
      movePolicyVersion: MOVE_POLICY_VERSION,
      completedAt: null,
      createdAt: input.createdAt,
    });
  });
}
