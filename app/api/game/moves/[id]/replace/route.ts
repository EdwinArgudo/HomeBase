import {
  createMoveReplaceHandler,
  loadAuthorizedMoveCandidates,
} from "../../../../../../lib/game";
import { requireHouseholdMember } from "../../../../../../lib/household";

export const dynamic = "force-dynamic";

export const POST = createMoveReplaceHandler({
  requireMember: requireHouseholdMember,
  candidateProvider: loadAuthorizedMoveCandidates,
  occurredAt: () => new Date().toISOString(),
});
