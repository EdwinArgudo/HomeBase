import { parsePersonaDraftInput } from "@homebase/contracts";

import { errorResponse, readJsonBody } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import {
  approveCurrentPersona,
  loadCurrentPersonaSnapshot,
  saveManualPersona,
} from "./service.ts";

type Dependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  now: () => string;
  createId: () => string;
  load?: typeof loadCurrentPersonaSnapshot;
  save?: typeof saveManualPersona;
  approve?: typeof approveCurrentPersona;
};

export function createCurrentPersonaHandlers(dependencies: Dependencies) {
  const load = dependencies.load ?? loadCurrentPersonaSnapshot;
  const save = dependencies.save ?? saveManualPersona;
  return {
    async GET(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        return Response.json(await load(context, dependencies.now()));
      } catch (error) {
        return errorResponse(error, "Unable to load your persona.");
      }
    },
    async PUT(request: Request) {
      try {
        const body = await readJsonBody(request, {
          limit: 8_192,
          tooLarge: "Persona details are too large.",
          invalid: "Persona details are invalid.",
          parse: parsePersonaDraftInput,
        });
        const context = await dependencies.requireMember(request);
        return Response.json(await save(context, body, {
          createId: dependencies.createId,
          updatedAt: dependencies.now(),
        }));
      } catch (error) {
        return errorResponse(error, "Unable to save your persona.");
      }
    },
  };
}

export function createApprovePersonaHandler(dependencies: Dependencies) {
  const approve = dependencies.approve ?? approveCurrentPersona;
  return async function POST(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      return Response.json(await approve(context, dependencies.now()));
    } catch (error) {
      return errorResponse(error, "Unable to approve your persona.");
    }
  };
}
