import { HttpError } from "../../../../lib/household";
import { createPlaidLinkToken } from "../../../../lib/plaid";

export async function POST(request: Request) {
  try {
    return Response.json(await createPlaidLinkToken(request));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to start Plaid Link." }, { status });
  }
}
