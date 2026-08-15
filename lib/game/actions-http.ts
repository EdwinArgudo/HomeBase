import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import type { MoveCandidate } from "@homebase/domain-game";

import { completeDailyMove } from "./completion.ts";
import { deferDailyMove, replaceDailyMove } from "./move-actions.ts";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
type BaseDependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
};

async function moveIdFrom(context: RouteContext) {
  const { id } = await context.params;
  if (!id || id.length > 128) throw new HttpError(400, "A valid move id is required.");
  return id;
}

async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 16_384) throw new HttpError(400, "Completion details are too large.");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Completion details must be valid JSON.");
  }
}

function safeActionError(error: unknown, fallback: string) {
  const isHttpError = error instanceof HttpError;
  return Response.json(
    { error: isHttpError ? error.message : fallback },
    { status: isHttpError ? error.status : 500 },
  );
}

export function createMoveCompleteHandler(dependencies: BaseDependencies & {
  occurredAt: () => string;
  createId: () => string;
  complete?: typeof completeDailyMove;
}) {
  const complete = dependencies.complete ?? completeDailyMove;
  return async function POST(request: Request, routeContext: RouteContext) {
    try {
      const moveId = await moveIdFrom(routeContext);
      const body = await jsonBody(request);
      const context = await dependencies.requireMember(request);
      return Response.json(await complete(context, moveId, body, {
        occurredAt: dependencies.occurredAt(),
        createId: dependencies.createId,
      }));
    } catch (error) {
      return safeActionError(error, "Unable to complete the move.");
    }
  };
}

export function createMoveDeferHandler(dependencies: BaseDependencies & {
  defer?: typeof deferDailyMove;
}) {
  const defer = dependencies.defer ?? deferDailyMove;
  return async function POST(request: Request, routeContext: RouteContext) {
    try {
      const moveId = await moveIdFrom(routeContext);
      const context = await dependencies.requireMember(request);
      return Response.json({ move: await defer(context, moveId) });
    } catch (error) {
      return safeActionError(error, "Unable to defer the move.");
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
      const moveId = await moveIdFrom(routeContext);
      const context = await dependencies.requireMember(request);
      return Response.json({ move: await replace(context, moveId, {
        candidateProvider: dependencies.candidateProvider,
        occurredAt: dependencies.occurredAt(),
      }) });
    } catch (error) {
      return safeActionError(error, "Unable to replace the move.");
    }
  };
}
