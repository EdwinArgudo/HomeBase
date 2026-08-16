import { requireMember } from "./membership";

export async function readMinimumMode(request: Request) {
  const { member, db } = await requireMember(request);
  const row = await db.prepare("SELECT minimum_mode FROM households WHERE id = ? LIMIT 1")
    .bind(member.household_id)
    .first<{ minimum_mode: number }>();
  return Boolean(row?.minimum_mode);
}

export async function setMinimumMode(request: Request, enabled: boolean) {
  const { member, db } = await requireMember(request);
  await db.prepare("UPDATE households SET minimum_mode = ? WHERE id = ?").bind(enabled ? 1 : 0, member.household_id).run();
  return enabled;
}
