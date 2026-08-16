import { parsePlansAction, type PlansActionV1 } from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { applyPlansAction, loadPlansSnapshot } from "./service.ts";

async function actionBody(request: Request): Promise<PlansActionV1> {
  const text = await request.text();
  if (text.length > 1_024) throw new HttpError(400, "Plan action is invalid.");
  try {
    return parsePlansAction(JSON.parse(text) as unknown);
  } catch {
    throw new HttpError(400, "Plan action is invalid.");
  }
}

function safeError(error: unknown, fallback: string) {
  const safe = error instanceof HttpError;
  return Response.json({ error: safe ? error.message : fallback }, { status: safe ? error.status : 500 });
}

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
      } catch (error) { return safeError(error, "Unable to load your plans."); }
    },
    async POST(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        const action = await actionBody(request);
        return Response.json(await apply(context, action, { generatedAt: dependencies.now(), createId: dependencies.createId }));
      } catch (error) { return safeError(error, "Unable to update your plans."); }
    },
  };
}
