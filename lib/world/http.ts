import { errorResponse } from "../http/index.ts";
import { withTelemetry } from "../observability/telemetry.ts";
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
      const projection = await withTelemetry("world.projected", () => ({ viewer: "member" }),
        () => loadWorld(context, dependencies.generatedAt()));
      return Response.json(projection);
    } catch (error) {
      return errorResponse(error, "Unable to load the household world.");
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
      const projection = await withTelemetry("world.projected", () => ({ viewer: "display" }),
        () => loadDisplayWorld(context, dependencies.generatedAt()));
      return Response.json(projection);
    } catch (error) {
      return errorResponse(error, "Unable to load the display.");
    }
  };
}
