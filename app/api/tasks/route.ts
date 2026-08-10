import { HttpError, updateTask } from "../../../lib/household";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    if (!body.id) throw new HttpError(400, "Task id is required.");
    await updateTask(request, body.id);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the task." }, { status });
  }
}
