import type { HouseholdContext } from "../household/types.ts";
import { errorResponse, readJsonBody, requireRouteId } from "../http/index.ts";
import type { MoveCandidate } from "@homebase/domain-game";

import { completeDailyMove } from "./completion.ts";
import { deferDailyMove, replaceDailyMove } from "./move-actions.ts";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
type BaseDependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
};

const MOVE_ID_REQUIRED = "A valid move id is required.";

export function createMoveCompleteHandler(dependencies: BaseDependencies & {
  occurredAt: () => string;
  createId: () => string;
  complete?: typeof completeDailyMove;
}) {
  const complete = dependencies.complete ?? completeDailyMove;
  return async function POST(request: Request, routeContext: RouteContext) {
    try {
      const moveId = await requireRouteId(routeContext.params, MOVE_ID_REQUIRED);
      const body = await readJsonBody(request, {
        limit: 16_384,
        tooLarge: "Completion details are too large.",
        invalid: "Completion details must be valid JSON.",
        whenEmpty: () => ({}),
      });
      const context = await dependencies.requireMember(request);
      return Response.json(await complete(context, moveId, body, {
        occurredAt: dependencies.occurredAt(),
        createId: dependencies.createId,
      }));
    } catch (error) {
      return errorResponse(error, "Unable to complete the move.");
    }
  };
}

export function createMoveDeferHandler(dependencies: BaseDependencies & {
  defer?: typeof deferDailyMove;
}) {
  const defer = dependencies.defer ?? deferDailyMove;
  return async function POST(request: Request, routeContext: RouteContext) {
    try {
      const moveId = await requireRouteId(routeContext.params, MOVE_ID_REQUIRED);
      const context = await dependencies.requireMember(request);
      return Response.json({ move: await defer(context, moveId) });
    } catch (error) {
      return errorResponse(error, "Unable to defer the move.");
    }
  };
}

export function createMoveReplaceHandler(dependencies: BaseDependencies & {
  candidateProvider: (context: HouseholdContext, localDate: string) => Promise<readonly MoveCandidate[]>;
  occurredAt: () => string;
  replace?: typeof replaceDailyMove;
}) {
  const replace = dependencies.replace ?? replaceDailyMove;
  return async function POST(request: Request, routeContext: RouteContext) {
    try {
      const moveId = await requireRouteId(routeContext.params, MOVE_ID_REQUIRED);
      const context = await dependencies.requireMember(request);
      return Response.json({ move: await replace(context, moveId, {
        candidateProvider: dependencies.candidateProvider,
        occurredAt: dependencies.occurredAt(),
      }) });
    } catch (error) {
      return errorResponse(error, "Unable to replace the move.");
    }
  };
}
