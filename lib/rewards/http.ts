import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { parseRewardEquipInput, type RewardEquipInputV1 } from "@homebase/contracts";
import { equipCurrentPersonaReward, loadAndMaterializeRewards } from "./service.ts";

async function equipBody(request: Request): Promise<RewardEquipInputV1> {
  const text = await request.text();
  if (text.length > 1_024) throw new HttpError(400, "Reward selection is invalid.");
  try {
    return parseRewardEquipInput(JSON.parse(text) as unknown);
  } catch {
    throw new HttpError(400, "Reward selection is invalid.");
  }
}

function safeError(error: unknown) {
  const safe = error instanceof HttpError;
  return Response.json(
    { error: safe ? error.message : "Unable to update the equipped reward." },
    { status: safe ? error.status : 500 },
  );
}

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

export function createRewardsEquipHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  now: () => string;
  equip?: typeof equipCurrentPersonaReward;
}) {
  const equip = dependencies.equip ?? equipCurrentPersonaReward;
  return async function PUT(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      const input = await equipBody(request);
      return Response.json(await equip(context, input, { updatedAt: dependencies.now() }));
    } catch (error) {
      return safeError(error);
    }
  };
}
