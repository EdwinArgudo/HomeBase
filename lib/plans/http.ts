import { parsePlansAction } from "@homebase/contracts";

import { errorResponse, readJsonBody } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { applyPlansAction, loadPlansSnapshot } from "./service.ts";

export function createPlansHandlers(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  now: () => string;
  createId: () => string;
  load?: typeof loadPlansSnapshot;
  apply?: typeof applyPlansAction;
}) {
  const load = dependencies.load ?? loadPlansSnapshot;
  const apply = dependencies.apply ?? applyPlansAction;
  return {
    async GET(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        return Response.json(await load(context, dependencies.now()));
      } catch (error) { return errorResponse(error, "Unable to load your plans."); }
    },
    async POST(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        const action = await readJsonBody(request, {
          limit: 1_024,
          tooLarge: "Plan action is invalid.",
          invalid: "Plan action is invalid.",
          parse: parsePlansAction,
        });
        return Response.json(await apply(context, action, { generatedAt: dependencies.now(), createId: dependencies.createId }));
      } catch (error) { return errorResponse(error, "Unable to update your plans."); }
    },
  };
}
