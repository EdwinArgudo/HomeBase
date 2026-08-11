import { HttpError, reviewTransaction } from "../../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; categoryId?: string; createRule?: boolean };
    if (!body.id || !body.categoryId) throw new HttpError(400, "Choose a budget category for this transaction.");
    await reviewTransaction(request, body.id, body.categoryId, body.createRule === true);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to review the transaction." }, { status });
  }
}
