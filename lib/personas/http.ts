import {
  parsePersonaDraftInput,
  type PersonaDraftInputV1,
} from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import {
  approveCurrentPersona,
  loadCurrentPersonaSnapshot,
  saveManualPersona,
} from "./service.ts";

async function requestBody(request: Request): Promise<PersonaDraftInputV1> {
  const text = await request.text();
  if (text.length > 8_192) throw new HttpError(400, "Persona details are too large.");
  try {
    return parsePersonaDraftInput(JSON.parse(text) as unknown);
  } catch {
    throw new HttpError(400, "Persona details are invalid.");
  }
}

function safeError(error: unknown, fallback: string) {
  const safe = error instanceof HttpError;
  return Response.json({ error: safe ? error.message : fallback }, { status: safe ? error.status : 500 });
}

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
        return safeError(error, "Unable to load your persona.");
      }
    },
    async PUT(request: Request) {
      try {
        const body = await requestBody(request);
        const context = await dependencies.requireMember(request);
        return Response.json(await save(context, body, {
          createId: dependencies.createId,
          updatedAt: dependencies.now(),
        }));
      } catch (error) {
        return safeError(error, "Unable to save your persona.");
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
      return safeError(error, "Unable to approve your persona.");
    }
  };
}
