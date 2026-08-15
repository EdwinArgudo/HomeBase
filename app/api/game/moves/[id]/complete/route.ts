import { createMoveCompleteHandler } from "../../../../../../lib/game";
import { requireHouseholdMember } from "../../../../../../lib/household";

export const dynamic = "force-dynamic";

export const POST = createMoveCompleteHandler({
  requireMember: requireHouseholdMember,
  occurredAt: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
