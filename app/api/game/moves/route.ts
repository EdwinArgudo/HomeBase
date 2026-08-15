import {
  createMovesGetHandler,
  loadAuthorizedMoveCandidates,
  loadHouseholdMinimumMode,
} from "../../../../lib/game";
import { requireHouseholdMember } from "../../../../lib/household";

export const dynamic = "force-dynamic";

export const GET = createMovesGetHandler({
  requireMember: requireHouseholdMember,
  candidateProvider: loadAuthorizedMoveCandidates,
  minimumModeProvider: loadHouseholdMinimumMode,
  createdAt: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
