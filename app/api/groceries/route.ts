import { HttpError, updateGrocery } from "../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: "add" | "toggle"; id?: string; text?: string };
    if (body.action !== "add" && body.action !== "toggle") throw new HttpError(400, "Unknown grocery action.");
    const item = await updateGrocery(request, body.action, body);
    return Response.json({ ok: true, item });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update groceries." }, { status });
  }
}
