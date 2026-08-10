import { HttpError, reviewTransaction } from "../../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; choice?: "ours" | "mine" };
    if (!body.id || (body.choice !== "ours" && body.choice !== "mine")) throw new HttpError(400, "Choose how this transaction should count.");
    await reviewTransaction(request, body.id, body.choice);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to review the transaction." }, { status });
  }
}
