import { deleteMerchantRule, HttpError } from "../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: string };
    if (body.action !== "delete" || !body.id) throw new HttpError(400, "Choose a merchant rule to remove.");
    await deleteMerchantRule(request, body.id);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update merchant rules." }, { status });
  }
}
