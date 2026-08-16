import { requireHouseholdMember } from "../../../../../lib/household";
import { createRewardsEquipHandler } from "../../../../../lib/rewards";

export const dynamic = "force-dynamic";

export const PUT = createRewardsEquipHandler({
  requireMember: requireHouseholdMember,
  now: () => new Date().toISOString(),
});
