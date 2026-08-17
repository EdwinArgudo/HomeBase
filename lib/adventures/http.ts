import { HttpError } from "../auth/identity.ts";
import { errorResponse, readJsonBody } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { acceptAdventure, loadAndSettleAdventures } from "./service.ts";

type Dependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  createId: () => string;
  load?: typeof loadAndSettleAdventures;
  accept?: typeof acceptAdventure;
};

export function createAdventuresHandlers(dependencies: Dependencies) {
  const load = dependencies.load ?? loadAndSettleAdventures;
  const accept = dependencies.accept ?? acceptAdventure;
  return {
    async GET(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        return Response.json(await load(context, dependencies.generatedAt()));
      } catch (error) {
        return errorResponse(error, "Unable to load your adventures.");
      }
    },
    async POST(request: Request) {
      try {
        const body = await readJsonBody(request, {
          limit: 1_024,
          tooLarge: "That request is too large.",
          invalid: "Choose an adventure to begin.",
        });
        const templateKey = (body as { templateKey?: unknown } | null)?.templateKey;
        if (typeof templateKey !== "string" || templateKey.length === 0 || templateKey.length > 64) {
          throw new HttpError(400, "Choose an adventure to begin.");
        }
        const context = await dependencies.requireMember(request);
        return Response.json(await accept(context, templateKey, {
          createId: dependencies.createId,
          generatedAt: dependencies.generatedAt(),
        }));
      } catch (error) {
        return errorResponse(error, "Unable to begin that adventure.");
      }
    },
  };
}
