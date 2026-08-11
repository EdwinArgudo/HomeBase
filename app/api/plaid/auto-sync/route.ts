import { HttpError } from "../../../../lib/household";
import { autoSyncPlaidConnections } from "../../../../lib/plaid";

export async function POST(request: Request) {
  try {
    return Response.json({ ok: true, ...(await autoSyncPlaidConnections(request)) });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to refresh bank connections." }, { status });
  }
}
