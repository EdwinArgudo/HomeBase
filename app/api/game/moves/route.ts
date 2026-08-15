import type { MoveCandidate } from "@homebase/domain-game";

import { createMovesGetHandler } from "../../../../lib/game";
import { requireHouseholdMember } from "../../../../lib/household";

export const dynamic = "force-dynamic";

// LG-005 intentionally exposes durable snapshots without connecting source
// domains. LG-006 will replace this with authorized task/goal/etc. adapters;
// server routes must never fall back to client demo fixtures.
async function emptyCandidateProvider(): Promise<readonly MoveCandidate[]> {
  return [];
}

export const GET = createMovesGetHandler({
  requireMember: requireHouseholdMember,
  candidateProvider: emptyCandidateProvider,
  createdAt: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
