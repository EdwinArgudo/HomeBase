import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../../household/types.ts";
import { EMPTY_SIGNALS, boundedTitle } from "./shared.ts";

type TaskCandidateRow = {
  id: string;
  owner_member_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
};

const TASK_CANDIDATES_SQL = `SELECT
  id, owner_member_id, title, status, due_date
FROM tasks
WHERE household_id = ?
  AND status = 'open'
  AND (owner_member_id IS NULL OR owner_member_id = ?)
ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC`;

export async function taskMoveCandidates(context: HouseholdContext, localDate: string) {
  const result = await context.db.prepare(TASK_CANDIDATES_SQL)
    .bind(context.member.household_id, context.member.id)
    .all<TaskCandidateRow>();

  return result.results.flatMap<MoveCandidate>((row) => {
    if (row.status !== "open") return [];
    const personal = row.owner_member_id !== null;
    if (personal && row.owner_member_id !== context.member.id) return [];
    const overdue = row.due_date !== null && row.due_date < localDate;
    const dueToday = row.due_date === localDate;
    return [{
      householdId: context.member.household_id,
      memberId: personal ? context.member.id : null,
      family: "tend",
      ownership: personal ? "personal" : "shared",
      visibility: personal ? "private" : "household",
      source: { type: "task", id: row.id },
      title: boundedTitle(row.title, 120),
      shortLabel: boundedTitle(row.title, 40),
      estimatedSeconds: 300,
      eligible: true,
      signals: {
        ...EMPTY_SIGNALS,
        urgency: overdue ? 0.85 : dueToday ? 0.35 : 0,
        dueSoon: overdue || dueToday ? 1 : 0,
        preference: row.due_date === null ? 0.35 : 0.2,
        cooperative: personal ? 0 : 0.25,
        effort: 0.25,
        repetition: 0.05,
      },
    }];
  });
}
