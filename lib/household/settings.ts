import { requireMember } from "./membership";

export async function setMinimumMode(request: Request, enabled: boolean) {
  const { member, db } = await requireMember(request);
  await db.prepare("UPDATE households SET minimum_mode = ? WHERE id = ?").bind(enabled ? 1 : 0, member.household_id).run();
}
