import { HttpError } from "../../../../lib/household";
import { syncPlaidConnection } from "../../../../lib/plaid";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { connectionId?: string };
    if (!body.connectionId) throw new HttpError(400, "Choose a bank connection to sync.");
    return Response.json({ ok: true, sync: await syncPlaidConnection(request, body.connectionId) });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sync that bank." }, { status });
  }
}
