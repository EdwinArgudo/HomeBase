import { HttpError } from "../auth/identity.ts";
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
      const { id } = await routeContext.params;
      if (!id || id.length > 128) throw new HttpError(400, "A valid move id is required.");
      return Response.json(await loadOptions(context, id));
    } catch (error) {
      const isHttpError = error instanceof HttpError;
      return Response.json(
        { error: isHttpError ? error.message : "Unable to load completion options." },
        { status: isHttpError ? error.status : 500 },
      );
    }
  };
}
