import { HttpError, loadHousehold } from "../../../lib/household";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json(await loadHousehold(request));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to load Homebase.";
    return Response.json({ error: message }, { status });
  }
}
