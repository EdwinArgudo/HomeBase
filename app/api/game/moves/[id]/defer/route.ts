import { createMoveDeferHandler } from "../../../../../../lib/game";
import { requireHouseholdMember } from "../../../../../../lib/household";

export const dynamic = "force-dynamic";

export const POST = createMoveDeferHandler({
  requireMember: requireHouseholdMember,
});
