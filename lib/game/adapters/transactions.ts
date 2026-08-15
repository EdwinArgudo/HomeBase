import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../../household/types.ts";
import { EMPTY_SIGNALS, daysBefore } from "./shared.ts";

type TransactionCandidateRow = {
  id: string;
  transaction_date: string;
  review_status: string;
  is_transfer: number;
  ownership_type: string;
  owner_member_id: string | null;
};

const TRANSACTION_CANDIDATES_SQL = `SELECT
  t.id, t.transaction_date, t.review_status, t.is_transfer,
  a.ownership_type, a.owner_member_id
FROM transactions t
JOIN accounts a ON a.id = t.account_id AND a.household_id = t.household_id
WHERE t.household_id = ?
  AND t.review_status = 'needs_review'
  AND t.is_transfer = 0
  AND (a.ownership_type = 'shared' OR (a.ownership_type = 'personal' AND a.owner_member_id = ?))
ORDER BY t.transaction_date ASC, t.id ASC`;

export async function transactionMoveCandidates(context: HouseholdContext, localDate: string) {
  const result = await context.db.prepare(TRANSACTION_CANDIDATES_SQL)
    .bind(context.member.household_id, context.member.id)
    .all<TransactionCandidateRow>();

  return result.results.flatMap<MoveCandidate>((row) => {
    if (row.review_status !== "needs_review" || Boolean(row.is_transfer)) return [];
    const personal = row.ownership_type === "personal";
    if (personal && row.owner_member_id !== context.member.id) return [];
    if (!personal && row.ownership_type !== "shared") return [];
    const age = daysBefore(localDate, row.transaction_date);
    return [{
      householdId: context.member.household_id,
      memberId: personal ? context.member.id : null,
      family: "tend",
      ownership: personal ? "personal" : "shared",
      visibility: personal ? "private" : "household",
      source: { type: "transaction", id: row.id },
      title: personal ? "Review a personal transaction" : "Review a household transaction",
      shortLabel: "Review transaction",
      estimatedSeconds: 75,
      eligible: true,
      signals: {
        ...EMPTY_SIGNALS,
        urgency: age >= 7 ? 0.8 : age >= 3 ? 0.45 : 0.1,
        uncertainty: 0.95,
        effort: 0.1,
        repetition: 0.1,
      },
    }];
  });
}
