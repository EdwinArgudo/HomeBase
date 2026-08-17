import { errorResponse, requireRouteId } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { loadMoveCompletionOptions } from "./completion-options.ts";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export function createMoveOptionsHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  loadOptions?: typeof loadMoveCompletionOptions;
}) {
  const loadOptions = dependencies.loadOptions ?? loadMoveCompletionOptions;
  return async function GET(request: Request, routeContext: RouteContext) {
    try {
      const context = await dependencies.requireMember(request);
      const id = await requireRouteId(routeContext.params, "A valid move id is required.");
      return Response.json(await loadOptions(context, id));
    } catch (error) {
      return errorResponse(error, "Unable to load completion options.");
    }
  };
}
