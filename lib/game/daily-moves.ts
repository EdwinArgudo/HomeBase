import {
  selectDailyMovesV1,
  type DailyMoveIdContext,
  type MoveCandidate,
} from "@homebase/domain-game";

import {
  insertDailyMoveSnapshot,
  readDailyMoveSnapshot,
  readRecentSourceIds,
  type DailyMoveScope,
} from "./daily-move-repository.ts";

// How far back a source counts as "seen recently" for the repetition penalty.
const REPETITION_WINDOW_DAYS = 3;

function localDateDaysBefore(localDate: string, days: number) {
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return localDate;
  return new Date(parsed - days * 86_400_000).toISOString().slice(0, 10);
}

export type DailyMoveSnapshotPolicy = {
  candidateProvider: (scope: DailyMoveScope) => Promise<readonly MoveCandidate[]>;
  createdAt: () => string;
  createId: (context: DailyMoveIdContext) => string;
  minimumMode?: boolean;
  minimumModeProvider?: () => Promise<boolean>;
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

  const [candidates, minimumMode, recentSourceIds] = await Promise.all([
    policy.candidateProvider(scope),
    policy.minimumModeProvider ? policy.minimumModeProvider() : Promise.resolve(Boolean(policy.minimumMode)),
    policy.recentSourceIds
      ? Promise.resolve(policy.recentSourceIds)
      : readRecentSourceIds(db, scope, localDateDaysBefore(scope.localDate, REPETITION_WINDOW_DAYS)),
  ]);
  const selected = selectDailyMovesV1({
    ...scope,
    candidates,
    createdAt: policy.createdAt(),
    createId: policy.createId,
    minimumMode,
    recentSourceIds,
    cooldownSourceIds: policy.cooldownSourceIds,
  });
  await insertDailyMoveSnapshot(db, scope, selected);

  // Re-read even after this request inserted. INSERT OR IGNORE plus the unique
  // member/date/slot key makes concurrent selectors converge on one snapshot.
  return readDailyMoveSnapshot(db, scope);
}
