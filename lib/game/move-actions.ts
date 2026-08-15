import { selectDailyMovesV1, type MoveCandidate } from "@homebase/domain-game";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { readAuthorizedDailyMove } from "./action-repository.ts";
import { readDailyMoveSnapshot } from "./daily-move-repository.ts";

export async function deferDailyMove(context: HouseholdContext, moveId: string) {
  const stored = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!stored) throw new HttpError(404, "Move not found.");
  if (stored.move.status === "deferred") return stored.move;
  if (stored.move.status !== "active") throw new HttpError(409, "Only an active move can be deferred.");

  await context.db.prepare(`UPDATE daily_moves SET status = 'deferred'
    WHERE id = ? AND household_id = ? AND member_id = ? AND status = 'active'`)
    .bind(moveId, context.member.household_id, context.member.id).run();
  const updated = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!updated || updated.move.status !== "deferred") {
    throw new HttpError(409, "The move could not be deferred. Refresh and try again.");
  }
  return updated.move;
}

type ReplacementDependencies = {
  candidateProvider: (context: HouseholdContext, localDate: string) => Promise<readonly MoveCandidate[]>;
  occurredAt: string;
};

export async function replaceDailyMove(
  context: HouseholdContext,
  moveId: string,
  dependencies: ReplacementDependencies,
) {
  const stored = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!stored) throw new HttpError(404, "Move not found.");
  if (stored.move.status !== "active") throw new HttpError(409, "Only an active move can be replaced.");
  if (stored.replacementCount > 0) throw new HttpError(409, "Today’s replacement has already been used.");

  const count = await context.db.prepare(`SELECT COALESCE(SUM(replacement_count), 0) AS count
    FROM daily_moves WHERE household_id = ? AND member_id = ? AND local_date = ?`)
    .bind(stored.move.householdId, stored.move.memberId, stored.move.localDate)
    .first<{ count: number }>();
  if (Number(count?.count ?? 0) > 0) throw new HttpError(409, "Today’s replacement has already been used.");

  const snapshot = await readDailyMoveSnapshot(context.db, {
    householdId: stored.move.householdId,
    memberId: stored.move.memberId,
    localDate: stored.move.localDate,
  });
  const excluded = snapshot.flatMap((move) => [move.source.id, `${move.source.type}:${move.source.id}`]);
  excluded.push(stored.move.source.id, `${stored.move.source.type}:${stored.move.source.id}`);
  const candidates = await dependencies.candidateProvider(context, stored.move.localDate);
  const [replacement] = selectDailyMovesV1({
    householdId: stored.move.householdId,
    memberId: stored.move.memberId,
    localDate: stored.move.localDate,
    createdAt: dependencies.occurredAt,
    candidates,
    maxMoves: 1,
    cooldownSourceIds: excluded,
    createId: () => stored.move.id,
  });
  if (!replacement) throw new HttpError(409, "No replacement move is available right now.");

  const result = await context.db.prepare(`UPDATE daily_moves SET
    family = ?, ownership_type = ?, visibility = ?, source_type = ?, source_id = ?,
    title = ?, short_label = ?, estimated_seconds = ?, selection_reason_code = ?,
    replacement_count = replacement_count + 1
    WHERE id = ? AND household_id = ? AND member_id = ? AND local_date = ?
      AND status = 'active' AND replacement_count = 0
      AND NOT EXISTS (
        SELECT 1 FROM daily_moves replacement_guard
        WHERE replacement_guard.household_id = ? AND replacement_guard.member_id = ?
          AND replacement_guard.local_date = ? AND replacement_guard.replacement_count > 0
      )`)
    .bind(
      replacement.family,
      replacement.ownership,
      replacement.visibility,
      replacement.source.type,
      replacement.source.id,
      replacement.title,
      replacement.shortLabel,
      replacement.estimatedSeconds,
      replacement.selectionReasonCode,
      stored.move.id,
      stored.move.householdId,
      stored.move.memberId,
      stored.move.localDate,
      stored.move.householdId,
      stored.move.memberId,
      stored.move.localDate,
    ).run();
  if (!result.meta.changes) throw new HttpError(409, "Today’s replacement has already been used.");

  const updated = await readAuthorizedDailyMove(context.db, context.member.household_id, context.member.id, moveId);
  if (!updated) throw new HttpError(404, "Move not found.");
  return updated.move;
}
