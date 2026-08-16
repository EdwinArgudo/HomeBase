import { HttpError, readMinimumMode, setMinimumMode } from "../../../../lib/household";

function safeError(error: unknown, fallback: string) {
  const safe = error instanceof HttpError;
  return Response.json({ error: safe ? error.message : fallback }, { status: safe ? error.status : 500 });
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json({ enabled: await readMinimumMode(request) });
  } catch (error) {
    return safeError(error, "Unable to read Rest mode.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { enabled?: boolean };
    return Response.json({ enabled: await setMinimumMode(request, Boolean(body.enabled)) });
  } catch (error) {
    return safeError(error, "Unable to update Rest mode.");
  }
}
