import { createProgressGetHandler } from "../../../../lib/game";
import { requireHouseholdMember } from "../../../../lib/household";

export const dynamic = "force-dynamic";

export const GET = createProgressGetHandler({
  requireMember: requireHouseholdMember,
  generatedAt: () => new Date().toISOString(),
});
