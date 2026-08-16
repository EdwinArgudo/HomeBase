import { requireHouseholdMember } from "../../../lib/household";
import { createWorldGetHandler } from "../../../lib/world";

export const dynamic = "force-dynamic";

export const GET = createWorldGetHandler({
  requireMember: requireHouseholdMember,
  generatedAt: () => new Date().toISOString(),
});
