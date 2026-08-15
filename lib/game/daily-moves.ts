import {
  selectDailyMovesV1,
  type DailyMoveIdContext,
  type MoveCandidate,
} from "@homebase/domain-game";

import {
  insertDailyMoveSnapshot,
  readDailyMoveSnapshot,
  type DailyMoveScope,
} from "./daily-move-repository.ts";

export type DailyMoveSnapshotPolicy = {
  candidateProvider: (scope: DailyMoveScope) => Promise<readonly MoveCandidate[]>;
  createdAt: () => string;
  createId: (context: DailyMoveIdContext) => string;
  minimumMode?: boolean;
  recentSourceIds?: readonly string[];
  cooldownSourceIds?: readonly string[];
};

export async function getOrCreateDailyMoveSnapshot(
  db: D1Database,
  scope: DailyMoveScope,
  policy: DailyMoveSnapshotPolicy,
) {
  const existing = await readDailyMoveSnapshot(db, scope);
  if (existing.length > 0) return existing;

  const candidates = await policy.candidateProvider(scope);
  const selected = selectDailyMovesV1({
    ...scope,
    candidates,
    createdAt: policy.createdAt(),
    createId: policy.createId,
    minimumMode: policy.minimumMode,
    recentSourceIds: policy.recentSourceIds,
    cooldownSourceIds: policy.cooldownSourceIds,
  });
  await insertDailyMoveSnapshot(db, scope, selected);

  // Re-read even after this request inserted. INSERT OR IGNORE plus the unique
  // member/date/slot key makes concurrent selectors converge on one snapshot.
  return readDailyMoveSnapshot(db, scope);
}
