import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../../household/types.ts";
import { EMPTY_SIGNALS } from "./shared.ts";

type GroceryCandidateRow = {
  id: string;
  checked: number;
};

const GROCERY_CANDIDATES_SQL = `SELECT id, checked
FROM grocery_items
WHERE household_id = ? AND checked = 0
ORDER BY id ASC`;

export async function groceryMoveCandidates(context: HouseholdContext) {
  const result = await context.db.prepare(GROCERY_CANDIDATES_SQL)
    .bind(context.member.household_id)
    .all<GroceryCandidateRow>();
  const unchecked = result.results.filter((row) => row.checked === 0);
  const first = unchecked[0];
  if (!first) return [];
  const count = unchecked.length;
  return [{
    householdId: context.member.household_id,
    memberId: null,
    family: "tend",
    ownership: "shared",
    visibility: "household",
    source: { type: "grocery_item", id: first.id },
    title: count === 1 ? "Choose one grocery item" : `Choose ${count} grocery items`,
    shortLabel: "Plan groceries",
    estimatedSeconds: 120,
    eligible: true,
    signals: {
      ...EMPTY_SIGNALS,
      preference: 0.5,
      cooperative: 0.65,
      effort: 0.15,
      repetition: 0.05,
    },
  }] satisfies MoveCandidate[];
}
