import { HttpError } from "../auth/identity.ts";
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
      const isHttpError = error instanceof HttpError;
      return Response.json(
        { error: isHttpError ? error.message : "Unable to load progress." },
        { status: isHttpError ? error.status : 500 },
      );
    }
  };
}
