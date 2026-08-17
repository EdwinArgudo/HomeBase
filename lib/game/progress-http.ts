import { errorResponse } from "../http/index.ts";
import type { HouseholdContext } from "../household/types.ts";
import { loadProgressSnapshot } from "./progress.ts";

export function createProgressGetHandler(dependencies: {
  requireMember: (request: Request) => Promise<HouseholdContext>;
  generatedAt: () => string;
  loadProgress?: typeof loadProgressSnapshot;
}) {
  const loadProgress = dependencies.loadProgress ?? loadProgressSnapshot;
  return async function GET(request: Request) {
    try {
      const context = await dependencies.requireMember(request);
      return Response.json(await loadProgress(context, dependencies.generatedAt()));
    } catch (error) {
      return errorResponse(error, "Unable to load progress.");
    }
  };
}
