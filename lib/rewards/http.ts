import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { loadAndMaterializeRewards } from "./service.ts";

export function createRewardsGetHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  loadRewards?: typeof loadAndMaterializeRewards;
}) {
  const loadRewards = dependencies.loadRewards ?? loadAndMaterializeRewards;
  return async function GET(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      return Response.json(await loadRewards(context, dependencies.generatedAt()));
    } catch (error) {
      const safe = error instanceof HttpError;
      return Response.json(
        { error: safe ? error.message : "Unable to load persona rewards." },
        { status: safe ? error.status : 500 },
      );
    }
  };
}
