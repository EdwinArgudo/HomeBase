import { HttpError, splitTransaction } from "../../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; splits?: Array<{ categoryId?: string; amountCents?: number }> };
    if (!body.id || !Array.isArray(body.splits)) throw new HttpError(400, "Add at least two split parts.");
    await splitTransaction(request, body.id, body.splits.map((split) => ({
      categoryId: split.categoryId ?? "",
      amountCents: split.amountCents ?? Number.NaN,
    })));
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to split the transaction." }, { status });
  }
}
