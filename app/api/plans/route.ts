import { requireHouseholdMember } from "../../../lib/household";
import { createPlansHandlers } from "../../../lib/plans";

export const dynamic = "force-dynamic";

const handlers = createPlansHandlers({
  requireMember: requireHouseholdMember,
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
