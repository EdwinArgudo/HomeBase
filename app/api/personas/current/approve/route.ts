import { requireHouseholdMember } from "../../../../../lib/household";
import { createApprovePersonaHandler } from "../../../../../lib/personas";

export const dynamic = "force-dynamic";

export const POST = createApprovePersonaHandler({
  requireMember: requireHouseholdMember,
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
