import { HttpError } from "../auth/identity.ts";
import { isUnownedOrOwned, normalizeMerchantName, ownsPersonalRecord } from "./authorization.ts";

export async function editableTransaction(db: D1Database, householdId: string, memberId: string, id: string) {
  const transaction = await db.prepare(`SELECT t.id, t.merchant_name, t.amount_cents, t.personal_member_id, a.owner_member_id AS account_owner_id, a.ownership_type AS account_ownership_type
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND t.household_id = ? LIMIT 1`).bind(id, householdId).first<{ id: string; merchant_name: string; amount_cents: number; personal_member_id: string | null; account_owner_id: string | null; account_ownership_type: string }>();
  if (!transaction) throw new HttpError(404, "Transaction not found.");
  const member = { id: memberId, household_id: householdId };
  if ((transaction.account_ownership_type === "personal" && !ownsPersonalRecord(member, transaction.account_owner_id)) || !isUnownedOrOwned(member, transaction.personal_member_id)) {
    throw new HttpError(403, "Only your partner can edit that private transaction.");
  }
  return transaction;
}

export async function prepareTransactionReviewStatements(
  db: D1Database,
  member: { id: string; household_id: string },
  id: string,
  categoryId: string,
  createRule: boolean,
  createId: () => string,
  moveGuard?: { moveId: string; memberId: string },
) {
  const transaction = await editableTransaction(db, member.household_id, member.id, id);
  const category = await db.prepare("SELECT id, ownership_type, owner_member_id FROM categories WHERE id = ? AND household_id = ? AND archived_at IS NULL LIMIT 1")
    .bind(categoryId, member.household_id).first<{ id: string; ownership_type: "shared" | "personal"; owner_member_id: string | null }>();
  if (!category) throw new HttpError(404, "That budget category is no longer available.");
  if (category.ownership_type === "personal" && !ownsPersonalRecord(member, category.owner_member_id)) {
    throw new HttpError(403, "Choose one of your own personal categories.");
  }
  const personalMemberId = category.ownership_type === "shared" ? null : member.id;
  const activeMoveSql = moveGuard
    ? `AND EXISTS (
        SELECT 1 FROM daily_moves guarded_move
        WHERE guarded_move.id = ? AND guarded_move.household_id = ?
          AND guarded_move.member_id = ? AND guarded_move.status = 'active'
          AND guarded_move.source_type = 'transaction' AND guarded_move.source_id = ?
      )`
    : "";
  const activeMoveValues = moveGuard
    ? [moveGuard.moveId, member.household_id, moveGuard.memberId, id]
    : [];
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM transaction_splits WHERE transaction_id = ? ${activeMoveSql}`)
      .bind(id, ...activeMoveValues),
    db.prepare(`UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = ?, review_status = 'ready'
      WHERE id = ? AND household_id = ? AND review_status = 'needs_review'
        AND (personal_member_id IS NULL OR personal_member_id = ?)
        AND EXISTS (
          SELECT 1 FROM accounts authorized_account
          WHERE authorized_account.id = transactions.account_id
            AND authorized_account.household_id = ?
            AND (authorized_account.ownership_type = 'shared' OR authorized_account.owner_member_id = ?)
        )
        ${activeMoveSql}`)
      .bind(
        category.ownership_type,
        personalMemberId,
        category.id,
        id,
        member.household_id,
        member.id,
        member.household_id,
        member.id,
        ...activeMoveValues,
      ),
  ];

  if (createRule) {
    const matchText = normalizeMerchantName(transaction.merchant_name);
    if (!matchText) throw new HttpError(400, "That merchant name cannot be saved as a rule.");
    statements.push(db.prepare(`INSERT INTO merchant_rules
      (id, household_id, created_by_member_id, match_text, merchant_name, category_id, spending_type, personal_member_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE 1 = 1 ${activeMoveSql}
      ON CONFLICT(household_id, created_by_member_id, match_text) DO UPDATE SET
        merchant_name = excluded.merchant_name,
        category_id = excluded.category_id,
        spending_type = excluded.spending_type,
        personal_member_id = excluded.personal_member_id,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(
        createId(),
        member.household_id,
        member.id,
        matchText,
        transaction.merchant_name.slice(0, 120),
        category.id,
        category.ownership_type,
        personalMemberId,
        ...activeMoveValues,
      ));

    const candidates = (await db.prepare(`SELECT t.id, t.merchant_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.household_id = ? AND t.review_status = 'needs_review'
        AND (a.ownership_type = 'shared' OR a.owner_member_id = ?)
        AND (t.personal_member_id IS NULL OR t.personal_member_id = ?)`).bind(member.household_id, member.id, member.id).all()).results as Array<{ id: string; merchant_name: string }>;
    for (const candidate of candidates) {
      if (candidate.id !== id && normalizeMerchantName(candidate.merchant_name) === matchText) {
        statements.push(db.prepare(`UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = ?, review_status = 'ready'
          WHERE id = ? AND household_id = ? AND review_status = 'needs_review'
            AND (personal_member_id IS NULL OR personal_member_id = ?)
            AND EXISTS (
              SELECT 1 FROM accounts authorized_account
              WHERE authorized_account.id = transactions.account_id
                AND authorized_account.household_id = ?
                AND (authorized_account.ownership_type = 'shared' OR authorized_account.owner_member_id = ?)
            )
            ${activeMoveSql}`)
          .bind(
            category.ownership_type,
            personalMemberId,
            category.id,
            candidate.id,
            member.household_id,
            member.id,
            member.household_id,
            member.id,
            ...activeMoveValues,
          ));
      }
    }
  }
  return { statements, transactionUpdateIndex: 1, transaction };
}
