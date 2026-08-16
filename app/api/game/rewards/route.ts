import { requireHouseholdMember } from "../../../../lib/household";
import { createRewardsGetHandler } from "../../../../lib/rewards";

export const dynamic = "force-dynamic";

export const GET = createRewardsGetHandler({
  requireMember: requireHouseholdMember,
  generatedAt: () => new Date().toISOString(),
});
