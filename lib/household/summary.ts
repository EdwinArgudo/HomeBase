import { resolveMember } from "./membership";

type MemberRow = { id: string; display_name: string; role: string };
type InvitationRow = { email: string; status: string };

/**
 * Everything the Living Game needs to show a household without touching the
 * money surfaces. Bootstraps the owner on first visit, so a member can start in
 * the new app instead of having to open the legacy dashboard first.
 */
export async function loadHouseholdSummary(request: Request) {
  const { member, db } = await resolveMember(request, true);

  const [household, members, invitation] = await Promise.all([
    db.prepare("SELECT name FROM households WHERE id = ? LIMIT 1")
      .bind(member.household_id)
      .first<{ name: string }>(),
    db.prepare(`SELECT id, display_name, role FROM members
      WHERE household_id = ?
      ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END ASC, display_name ASC`)
      .bind(member.household_id)
      .all<MemberRow>(),
    db.prepare(`SELECT email, status FROM invitations
      WHERE household_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`)
      .bind(member.household_id)
      .first<InvitationRow>(),
  ]);

  return {
    householdName: household?.name ?? "Our household",
    // Display names only. A member's email is theirs, not household information.
    members: members.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      role: row.role === "owner" ? "owner" as const : "member" as const,
      isYou: row.id === member.id,
    })),
    canInvite: member.role === "owner" && members.results.length < 2,
    invitation: invitation ? { email: invitation.email, status: invitation.status } : null,
  };
}
