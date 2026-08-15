import type { MoveCandidate } from "@homebase/domain-game";

import type { HouseholdContext } from "../../household/types.ts";
import { EMPTY_SIGNALS } from "./shared.ts";

type BankConnectionCandidateRow = {
  id: string;
  status: string;
  ownership_type: string;
  owner_member_id: string | null;
};

const BANK_CONNECTION_CANDIDATES_SQL = `SELECT
  id, status, ownership_type, owner_member_id
FROM bank_connections
WHERE household_id = ?
  AND status = 'attention'
  AND (ownership_type = 'shared' OR (ownership_type = 'personal' AND owner_member_id = ?))
ORDER BY id ASC`;

export async function bankConnectionMoveCandidates(context: HouseholdContext) {
  const result = await context.db.prepare(BANK_CONNECTION_CANDIDATES_SQL)
    .bind(context.member.household_id, context.member.id)
    .all<BankConnectionCandidateRow>();

  return result.results.flatMap<MoveCandidate>((row) => {
    if (row.status !== "attention") return [];
    const personal = row.ownership_type === "personal";
    if (personal && row.owner_member_id !== context.member.id) return [];
    if (!personal && row.ownership_type !== "shared") return [];
    return [{
      householdId: context.member.household_id,
      memberId: personal ? context.member.id : null,
      family: "tend",
      ownership: personal ? "personal" : "shared",
      visibility: personal ? "private" : "household",
      source: { type: "bank_connection", id: row.id },
      title: personal ? "Repair your bank connection" : "Repair a household connection",
      shortLabel: "Repair connection",
      estimatedSeconds: 180,
      eligible: true,
      signals: {
        ...EMPTY_SIGNALS,
        urgency: 1,
        uncertainty: 0.5,
        effort: 0.2,
      },
    }];
  });
}
