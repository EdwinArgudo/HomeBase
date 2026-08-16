import { createAdventuresHandlers } from "../../../../lib/adventures";
import { requireHouseholdMember } from "../../../../lib/household";

export const dynamic = "force-dynamic";

const handlers = createAdventuresHandlers({
  requireMember: requireHouseholdMember,
  generatedAt: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
