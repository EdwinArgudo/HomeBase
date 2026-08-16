import { requireHouseholdMember } from "../../../../lib/household";
import { createCurrentPersonaHandlers } from "../../../../lib/personas";

export const dynamic = "force-dynamic";

const handlers = createCurrentPersonaHandlers({
  requireMember: requireHouseholdMember,
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
