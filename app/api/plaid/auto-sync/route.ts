import { HttpError } from "../../../../lib/household";
import { autoSyncPlaidConnections } from "../../../../lib/plaid";

export async function POST(request: Request) {
  try {
    return Response.json({ ok: true, ...(await autoSyncPlaidConnections(request)) });
  } catch (error) {
    const safe = error instanceof HttpError;
    return Response.json({ error: safe ? error.message : "Unable to refresh bank connections." }, { status: safe ? error.status : 500 });
  }
}
