import { requireHouseholdMember } from "../../../../lib/household";
import { createDisplayWorldGetHandler } from "../../../../lib/world";

export const dynamic = "force-dynamic";

export const GET = createDisplayWorldGetHandler({
  requireMember: requireHouseholdMember,
  generatedAt: () => new Date().toISOString(),
});
