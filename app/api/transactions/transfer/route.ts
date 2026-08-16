import { HttpError, setTransactionTransfer } from "../../../../lib/household";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; isTransfer?: boolean };
    if (!body.id) throw new HttpError(400, "Choose a transaction.");
    await setTransactionTransfer(request, body.id, body.isTransfer === true);
    return Response.json({ ok: true });
  } catch (error) {
    const safe = error instanceof HttpError;
    return Response.json(
      { error: safe ? error.message : "Unable to update that transaction." },
      { status: safe ? error.status : 500 },
    );
  }
}
