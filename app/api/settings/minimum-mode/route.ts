import { HttpError, setMinimumMode } from "../../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { enabled?: boolean };
    await setMinimumMode(request, Boolean(body.enabled));
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update Minimum Mode." }, { status });
  }
}
