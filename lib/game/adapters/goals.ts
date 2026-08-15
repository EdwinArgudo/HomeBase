import type { MoveFamily } from "@homebase/contracts";
import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../../household/types.ts";
import { EMPTY_SIGNALS, boundedTitle } from "./shared.ts";

export const GOAL_CLASSIFIER_VERSION = 1 as const;

const MOVEMENT_KEYWORDS = new Set([
  "bike", "cycling", "exercise", "fitness", "gym", "hike", "run", "strength", "swim", "walk", "workout", "yoga",
]);
const LEARNING_KEYWORDS = new Set([
  "course", "french", "language", "learn", "read", "spanish", "study", "vocabulary",
]);

type GoalCandidateRow = {
  id: string;
  owner_member_id: string | null;
  ownership_type: string;
  name: string;
  tracking_type: string;
  active: number;
};

const GOAL_CANDIDATES_SQL = `SELECT
  id, owner_member_id, ownership_type, name, tracking_type, active
FROM goals
WHERE household_id = ?
  AND active = 1
  AND (ownership_type = 'shared' OR (ownership_type = 'personal' AND owner_member_id = ?))
ORDER BY id ASC`;

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function classifyGoalFamilyV1(
  name: string,
  trackingType: string,
  ownership: "personal" | "shared",
): MoveFamily {
  if (trackingType === "amount") return "tend";
  const tokens = words(name);
  if (tokens.some((token) => MOVEMENT_KEYWORDS.has(token))) return "move";
  if (tokens.some((token) => LEARNING_KEYWORDS.has(token))) return "grow";
  return ownership === "shared" ? "connect" : "grow";
}

export async function goalMoveCandidates(context: HouseholdContext) {
  const result = await context.db.prepare(GOAL_CANDIDATES_SQL)
    .bind(context.member.household_id, context.member.id)
    .all<GoalCandidateRow>();

  return result.results.flatMap<MoveCandidate>((row) => {
    if (row.active !== 1) return [];
    const personal = row.ownership_type === "personal";
    if (personal && row.owner_member_id !== context.member.id) return [];
    if (!personal && row.ownership_type !== "shared") return [];
    const ownership = personal ? "personal" : "shared";
    return [{
      householdId: context.member.household_id,
      memberId: personal ? context.member.id : null,
      family: classifyGoalFamilyV1(row.name, row.tracking_type, ownership),
      ownership,
      visibility: personal ? "private" : "household",
      source: { type: "goal", id: row.id },
      title: boundedTitle(row.name, 120),
      shortLabel: boundedTitle(row.name, 40),
      estimatedSeconds: 300,
      eligible: true,
      signals: {
        ...EMPTY_SIGNALS,
        preference: 0.65,
        cooperative: personal ? 0 : 0.5,
        effort: 0.25,
        repetition: 0.1,
      },
    }];
  });
}
