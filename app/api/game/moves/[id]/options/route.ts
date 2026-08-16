import { createMoveOptionsHandler } from "../../../../../../lib/game";
import { requireHouseholdMember } from "../../../../../../lib/household";

export const dynamic = "force-dynamic";

export const GET = createMoveOptionsHandler({
  requireMember: requireHouseholdMember,
});
