import { HttpError, saveInvitation } from "../../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    return Response.json(await saveInvitation(request, body.email ?? ""));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to save the invitation.";
    return Response.json({ error: message }, { status });
  }
}
