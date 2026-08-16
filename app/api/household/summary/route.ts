import { HttpError, loadHouseholdSummary } from "../../../../lib/household";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json(await loadHouseholdSummary(request));
  } catch (error) {
    const safe = error instanceof HttpError;
    return Response.json(
      { error: safe ? error.message : "Unable to load your household." },
      { status: safe ? error.status : 500 },
    );
  }
}
