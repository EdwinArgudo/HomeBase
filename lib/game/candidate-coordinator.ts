import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../household/types.ts";
import { bankConnectionMoveCandidates } from "./adapters/bank-connections.ts";
import { goalMoveCandidates } from "./adapters/goals.ts";
import { groceryMoveCandidates } from "./adapters/groceries.ts";
import { taskMoveCandidates } from "./adapters/tasks.ts";
import { transactionMoveCandidates } from "./adapters/transactions.ts";

export async function loadAuthorizedMoveCandidates(
  context: HouseholdContext,
  localDate: string,
): Promise<readonly MoveCandidate[]> {
  const groups = await Promise.all([
    transactionMoveCandidates(context, localDate),
    bankConnectionMoveCandidates(context),
    taskMoveCandidates(context, localDate),
    groceryMoveCandidates(context),
    goalMoveCandidates(context),
  ]);
  return groups.flat();
}

export async function loadHouseholdMinimumMode(context: HouseholdContext) {
  const row = await context.db.prepare(
    "SELECT minimum_mode FROM households WHERE id = ? LIMIT 1",
  ).bind(context.member.household_id).first<{ minimum_mode: number }>();
  return Boolean(row?.minimum_mode);
}
