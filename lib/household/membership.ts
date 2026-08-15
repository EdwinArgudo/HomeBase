import { identityBeforeStorage } from "../auth/identity";
import { HttpError } from "../auth/identity";
import { readyHouseholdDatabase } from "./storage";
import type { HouseholdContext, MemberRow } from "./types";

function ids(householdId: string, ownerId: string) {
  return {
    sharedGroceries: `${householdId}-cat-groceries`,
    sharedDining: `${householdId}-cat-dining`,
    sharedHousehold: `${householdId}-cat-household`,
    sharedTransport: `${householdId}-cat-transport`,
    ownerHobbies: `${ownerId}-cat-hobbies`,
    ownerDining: `${ownerId}-cat-dining`,
    ownerClothing: `${ownerId}-cat-clothing`,
    ownerVisa: `${ownerId}-account-visa`,
    jointCard: `${householdId}-account-joint`,
  };
}

async function seedHousehold(db: D1Database, householdId: string, ownerId: string) {
  const seed = ids(householdId, ownerId);
  await db.batch([
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Groceries', 60000)").bind(seed.sharedGroceries, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Dining out', 35000)").bind(seed.sharedDining, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Household', 20000)").bind(seed.sharedHousehold, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, NULL, 'shared', 'Transportation', 25000)").bind(seed.sharedTransport, householdId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Hobbies', 15000)").bind(seed.ownerHobbies, householdId, ownerId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Dining out', 7500)").bind(seed.ownerDining, householdId, ownerId),
    db.prepare("INSERT INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Clothing', 10000)").bind(seed.ownerClothing, householdId, ownerId),
    db.prepare("INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, institution_name, name, type, mask) VALUES (?, ?, ?, 'personal', 'Demo Bank', 'Visa', 'credit', '4242')").bind(seed.ownerVisa, householdId, ownerId),
    db.prepare("INSERT INTO accounts (id, household_id, owner_member_id, ownership_type, institution_name, name, type, mask) VALUES (?, ?, NULL, 'shared', 'Demo Bank', 'Joint Mastercard', 'credit', '1884')").bind(seed.jointCard, householdId),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, category_id, review_status) VALUES (?, ?, ?, 'Whole Foods', 8427, '2026-08-09', 'shared', ?, 'ready')").bind(`${householdId}-txn-whole-foods`, householdId, seed.ownerVisa, seed.sharedGroceries),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, spending_type, category_id, review_status) VALUES (?, ?, ?, 'MTA', 2900, '2026-08-08', 'shared', ?, 'ready')").bind(`${householdId}-txn-mta`, householdId, seed.jointCard, seed.sharedTransport),
    db.prepare("INSERT INTO transactions (id, household_id, account_id, merchant_name, amount_cents, transaction_date, review_status) VALUES (?, ?, ?, 'Costco', 12642, '2026-08-08', 'needs_review')").bind(`${householdId}-txn-costco`, householdId, seed.ownerVisa),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, NULL, 'Plan this week''s dinners', 'open')").bind(`${householdId}-task-dinners`, householdId),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, ?, 'Take recycling downstairs', 'open')").bind(`${householdId}-task-recycling`, householdId, ownerId),
    db.prepare("INSERT INTO tasks (id, household_id, owner_member_id, title, status) VALUES (?, ?, ?, 'Book annual checkup', 'complete')").bind(`${householdId}-task-checkup`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Milk', 0)").bind(`${householdId}-grocery-milk`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Bananas', 0)").bind(`${householdId}-grocery-bananas`, householdId, ownerId),
    db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name, checked) VALUES (?, ?, ?, 'Dish soap', 1)").bind(`${householdId}-grocery-soap`, householdId, ownerId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value, minimum_value) VALUES (?, ?, NULL, 'shared', 'Move together', 'sessions', 3, 1)").bind(`${householdId}-goal-workouts`, householdId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value, minimum_value) VALUES (?, ?, ?, 'personal', 'Spanish momentum', 'sessions', 4, 1)").bind(`${householdId}-goal-spanish`, householdId, ownerId),
    db.prepare("INSERT INTO goals (id, household_id, owner_member_id, ownership_type, name, tracking_type, target_value) VALUES (?, ?, NULL, 'shared', 'Weekend getaway', 'amount', 200000)").bind(`${householdId}-goal-savings`, householdId),
  ]);
}

async function seedPersonalCategories(db: D1Database, householdId: string, memberId: string) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Personal care', 15000)").bind(`${memberId}-cat-care`, householdId, memberId),
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Dining out', 7500)").bind(`${memberId}-cat-dining`, householdId, memberId),
    db.prepare("INSERT OR IGNORE INTO categories (id, household_id, owner_member_id, ownership_type, name, monthly_limit_cents) VALUES (?, ?, ?, 'personal', 'Clothing', 10000)").bind(`${memberId}-cat-clothing`, householdId, memberId),
  ]);
}

export async function resolveMember(request: Request, allowOwnerBootstrap: boolean): Promise<HouseholdContext> {
  const { identity, storage: db } = await identityBeforeStorage(request, readyHouseholdDatabase);
  const existing = await db.prepare("SELECT * FROM members WHERE external_user_id = ? LIMIT 1").bind(identity.externalId).first<MemberRow>();
  if (existing) return { identity, member: existing, db };

  const invitation = await db.prepare("SELECT * FROM invitations WHERE email = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").bind(identity.email).first<{ id: string; household_id: string }>();
  if (invitation) {
    const memberId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO members (id, household_id, external_user_id, email, display_name, role) VALUES (?, ?, ?, ?, ?, 'member')").bind(memberId, invitation.household_id, identity.externalId, identity.email, identity.displayName),
      db.prepare("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invitation.id),
    ]);
    await seedPersonalCategories(db, invitation.household_id, memberId);
    const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first<MemberRow>();
    return { identity, member: member!, db };
  }

  const householdCount = await db.prepare("SELECT COUNT(*) AS count FROM households").first<{ count: number }>();
  if (!allowOwnerBootstrap || Number(householdCount?.count ?? 0) > 0) {
    throw new HttpError(403, "This account has not been invited to the household.");
  }

  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO households (id, name) VALUES (?, 'Our household')").bind(householdId),
    db.prepare("INSERT INTO members (id, household_id, external_user_id, email, display_name, role) VALUES (?, ?, ?, ?, ?, 'owner')").bind(memberId, householdId, identity.externalId, identity.email, identity.displayName),
  ]);
  await seedHousehold(db, householdId, memberId);
  const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first<MemberRow>();
  return { identity, member: member!, db };
}

export function requireMember(request: Request) {
  return resolveMember(request, false);
}

export function requireHouseholdMember(request: Request) {
  return requireMember(request);
}
