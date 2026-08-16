import { parseMoveCompletionOptions, type MoveCompletionOptionsV1 } from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { readAuthorizedDailyMove } from "./action-repository.ts";

type CategoryRow = {
  id: string;
  name: string;
  ownership_type: "personal" | "shared";
};

export async function loadMoveCompletionOptions(
  context: HouseholdContext,
  moveId: string,
): Promise<MoveCompletionOptionsV1> {
  const stored = await readAuthorizedDailyMove(
    context.db,
    context.member.household_id,
    context.member.id,
    moveId,
  );
  if (!stored) throw new HttpError(404, "Move not found.");

  if (stored.move.source.type === "transaction") {
    const result = await context.db.prepare(`SELECT id, name, ownership_type
      FROM categories
      WHERE household_id = ? AND archived_at IS NULL
        AND (ownership_type = 'shared' OR (ownership_type = 'personal' AND owner_member_id = ?))
      ORDER BY name COLLATE NOCASE ASC, id ASC`)
      .bind(context.member.household_id, context.member.id)
      .all<CategoryRow>();
    return parseMoveCompletionOptions({
      contractVersion: 1,
      moveId: stored.move.id,
      kind: "transaction",
      categories: result.results.map((category) => ({
        id: category.id,
        name: category.name,
        ownership: category.ownership_type,
      })),
      createRuleDefault: false,
    });
  }

  if (stored.move.source.type === "goal") {
    return parseMoveCompletionOptions({
      contractVersion: 1,
      moveId: stored.move.id,
      kind: "goal",
      unitLabel: "progress units",
      defaultValue: 1,
    });
  }

  return parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: stored.move.id,
    kind: "none",
  });
}
