import { HttpError } from "../auth/identity";
import { ownsPersonalRecord } from "./authorization";
import { requireMember } from "./membership";
import { editableTransaction, prepareTransactionReviewStatements } from "./transaction-review.ts";

export async function reviewTransaction(request: Request, id: string, categoryId: string, createRule = false) {
  const { member, db } = await requireMember(request);
  const plan = await prepareTransactionReviewStatements(db, member, id, categoryId, createRule, () => crypto.randomUUID());
  const results = await db.batch(plan.statements);
  if (!results[plan.transactionUpdateIndex]?.meta.changes) throw new HttpError(404, "Transaction not found.");
}

export async function splitTransaction(request: Request, id: string, splits: Array<{ categoryId: string; amountCents: number }>) {
  const { member, db } = await requireMember(request);
  if (splits.length < 2 || splits.length > 10) throw new HttpError(400, "Split the transaction into two to ten parts.");
  const transaction = await editableTransaction(db, member.household_id, member.id, id);
  const seen = new Set<string>();
  let total = 0;
  for (const split of splits) {
    if (!split.categoryId || seen.has(split.categoryId)) throw new HttpError(400, "Choose each split category once.");
    if (!Number.isInteger(split.amountCents) || split.amountCents <= 0) throw new HttpError(400, "Every split needs a positive amount.");
    seen.add(split.categoryId);
    total += split.amountCents;
  }
  if (total !== Number(transaction.amount_cents)) throw new HttpError(400, "Split amounts must add up to the transaction total.");

  const categoryRows = (await db.prepare("SELECT id, ownership_type, owner_member_id FROM categories WHERE household_id = ? AND archived_at IS NULL")
    .bind(member.household_id).all()).results as Array<{ id: string; ownership_type: "shared" | "personal"; owner_member_id: string | null }>;
  const categories = new Map(categoryRows.map((category) => [category.id, category]));
  const parts = splits.map((split) => {
    const category = categories.get(split.categoryId);
    if (!category) throw new HttpError(404, "One of those budget categories is no longer available.");
    if (category.ownership_type === "personal" && !ownsPersonalRecord(member, category.owner_member_id)) throw new HttpError(403, "Choose only shared categories or your own personal categories.");
    return { ...split, category, personalMemberId: category.ownership_type === "personal" ? member.id : null };
  });
  const spendingTypes = new Set(parts.map((part) => part.category.ownership_type));
  const singleType = spendingTypes.size === 1 ? parts[0].category.ownership_type : null;
  const statements: D1PreparedStatement[] = [db.prepare("DELETE FROM transaction_splits WHERE transaction_id = ?").bind(id)];
  for (const part of parts) {
    statements.push(db.prepare("INSERT INTO transaction_splits (id, transaction_id, category_id, spending_type, personal_member_id, amount_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, part.categoryId, part.category.ownership_type, part.personalMemberId, part.amountCents));
  }
  statements.push(db.prepare("UPDATE transactions SET spending_type = ?, personal_member_id = ?, category_id = NULL, review_status = 'split' WHERE id = ? AND household_id = ?")
    .bind(singleType, singleType === "personal" ? member.id : null, id, member.household_id));
  const results = await db.batch(statements);
  if (!results.at(-1)?.meta.changes) throw new HttpError(404, "Transaction not found.");
}

export async function deleteMerchantRule(request: Request, id: string) {
  const { member, db } = await requireMember(request);
  const result = await db.prepare("DELETE FROM merchant_rules WHERE id = ? AND household_id = ? AND created_by_member_id = ?")
    .bind(id, member.household_id, member.id).run();
  if (!result.meta.changes) throw new HttpError(404, "Merchant rule not found.");
}
