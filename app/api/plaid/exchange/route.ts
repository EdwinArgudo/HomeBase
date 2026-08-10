import { HttpError } from "../../../../lib/household";
import { exchangePlaidPublicToken } from "../../../../lib/plaid";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { publicToken?: string; ownership?: "ours" | "mine"; institutionName?: string };
    if (!body.publicToken || (body.ownership !== "ours" && body.ownership !== "mine")) throw new HttpError(400, "Plaid did not return a complete connection.");
    return Response.json({ ok: true, connection: await exchangePlaidPublicToken(request, { publicToken: body.publicToken, ownership: body.ownership, institutionName: body.institutionName }) });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save the Plaid connection." }, { status });
  }
}
