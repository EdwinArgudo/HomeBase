import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";
import { loadDisplayWorldProjection, loadMemberWorldProjection } from "./service.ts";

export function createWorldGetHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  loadWorld?: typeof loadMemberWorldProjection;
}) {
  const loadWorld = dependencies.loadWorld ?? loadMemberWorldProjection;
  return async function GET(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      return Response.json(await loadWorld(context, dependencies.generatedAt()));
    } catch (error) {
      const safe = error instanceof HttpError;
      return Response.json(
        { error: safe ? error.message : "Unable to load the household world." },
        { status: safe ? error.status : 500 },
      );
    }
  };
}

export function createDisplayWorldGetHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  loadDisplayWorld?: typeof loadDisplayWorldProjection;
}) {
  const loadDisplayWorld = dependencies.loadDisplayWorld ?? loadDisplayWorldProjection;
  return async function GET(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      return Response.json(await loadDisplayWorld(context, dependencies.generatedAt()));
    } catch (error) {
      const safe = error instanceof HttpError;
      return Response.json(
        { error: safe ? error.message : "Unable to load the display." },
        { status: safe ? error.status : 500 },
      );
    }
  };
}
