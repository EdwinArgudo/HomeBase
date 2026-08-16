import { HttpError, normalizeEmail } from "../auth/identity";
import { requireMember } from "./membership";
import { auditEventStatement } from "../observability/audit.ts";

export async function saveInvitation(request: Request, emailValue: string) {
  const { member, db } = await requireMember(request);
  if (member.role !== "owner") throw new HttpError(403, "Only the household owner can invite a partner.");
  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (email === member.email) throw new HttpError(400, "Use your partner’s email address.");
  const count = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE household_id = ?").bind(member.household_id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 2) throw new HttpError(409, "This household already has two members.");
  const invitationId = crypto.randomUUID();
  const invitationStatement = db.prepare(`INSERT INTO invitations (id, household_id, email, invited_by_member_id, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(household_id, email) DO UPDATE SET status = 'pending', invited_by_member_id = excluded.invited_by_member_id, created_at = CURRENT_TIMESTAMP, accepted_at = NULL`)
    .bind(invitationId, member.household_id, email, member.id);
  await db.batch([
    invitationStatement,
    auditEventStatement(db, {
      householdId: member.household_id,
      memberId: member.id,
      action: "invitation.saved",
      subjectType: "invitation",
      subjectId: invitationId,
      occurredAt: new Date().toISOString(),
    }),
  ]);
  return { id: invitationId, email, status: "pending" };
}
