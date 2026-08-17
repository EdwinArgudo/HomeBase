import { isValidLocalDate, type DailyMoveIdContext, type MoveCandidate } from "@homebase/domain-game";

import { HttpError } from "../auth/identity.ts";
import { errorResponse } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { getOrCreateDailyMoveSnapshot } from "./daily-moves.ts";

type MovesHttpDependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  candidateProvider: (context: HouseholdContext, localDate: string) => Promise<readonly MoveCandidate[]>;
  minimumModeProvider?: (context: HouseholdContext) => Promise<boolean>;
  createdAt: () => string;
  createId: (context: DailyMoveIdContext) => string;
};

export function createMovesGetHandler(dependencies: MovesHttpDependencies) {
  const minimumModeProvider = dependencies.minimumModeProvider;
  return async function GET(request: Request) {
    try {
      const localDate = new URL(request.url).searchParams.get("date") ?? "";
      if (!isValidLocalDate(localDate)) throw new HttpError(400, "A valid date in YYYY-MM-DD format is required.");

      const context = await dependencies.requireMember(request);
      const moves = await getOrCreateDailyMoveSnapshot(context.db, {
        householdId: context.member.household_id,
        memberId: context.member.id,
        localDate,
      }, {
        candidateProvider: () => dependencies.candidateProvider(context, localDate),
        minimumModeProvider: minimumModeProvider
          ? () => minimumModeProvider(context)
          : undefined,
        createdAt: dependencies.createdAt,
        createId: dependencies.createId,
      });
      return Response.json({ moves });
    } catch (error) {
      return errorResponse(error, "Unable to load daily moves.");
    }
  };
}
