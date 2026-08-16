import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { acceptAdventure, loadAndSettleAdventures } from "./service.ts";

type Dependencies = {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  createId: () => string;
  load?: typeof loadAndSettleAdventures;
  accept?: typeof acceptAdventure;
};

function safeError(error: unknown, fallback: string) {
  const safe = error instanceof HttpError;
  return Response.json({ error: safe ? error.message : fallback }, { status: safe ? error.status : 500 });
}

export function createAdventuresHandlers(dependencies: Dependencies) {
  const load = dependencies.load ?? loadAndSettleAdventures;
  const accept = dependencies.accept ?? acceptAdventure;
  return {
    async GET(request: Request) {
      try {
        const context = await dependencies.requireMember(request);
        return Response.json(await load(context, dependencies.generatedAt()));
      } catch (error) {
        return safeError(error, "Unable to load your adventures.");
      }
    },
    async POST(request: Request) {
      try {
        const text = await request.text();
        if (text.length > 1_024) throw new HttpError(400, "That request is too large.");
        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          throw new HttpError(400, "Choose an adventure to begin.");
        }
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
        return safeError(error, "Unable to begin that adventure.");
      }
    },
  };
}
