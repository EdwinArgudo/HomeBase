import { parseRewardEquipInput } from "@homebase/contracts";

import { errorResponse, readJsonBody } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { equipCurrentPersonaReward, loadAndMaterializeRewards } from "./service.ts";

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
      return errorResponse(error, "Unable to load persona rewards.");
    }
  };
}

export function createRewardsEquipHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  now: () => string;
  equip?: typeof equipCurrentPersonaReward;
}) {
  const equip = dependencies.equip ?? equipCurrentPersonaReward;
  return async function PUT(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      const input = await readJsonBody(request, {
        limit: 1_024,
        tooLarge: "Reward selection is invalid.",
        invalid: "Reward selection is invalid.",
        parse: parseRewardEquipInput,
      });
      return Response.json(await equip(context, input, { updatedAt: dependencies.now() }));
    } catch (error) {
      return errorResponse(error, "Unable to update the equipped reward.");
    }
  };
}
