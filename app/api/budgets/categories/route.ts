import { createBudgetCategory, HttpError, saveBudgetLimits } from "../../../../lib/household";

type LimitChange = { id?: string; limitCents?: number; rolloverEnabled?: boolean };

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: "update-limits" | "create";
      changes?: LimitChange[];
      scope?: "ours" | "mine";
      name?: string;
      limitCents?: number;
      month?: string;
    };

    if (body.action === "update-limits") {
      const changes = (body.changes ?? []).map((change) => ({ id: change.id ?? "", limitCents: change.limitCents ?? Number.NaN, rolloverEnabled: change.rolloverEnabled === true }));
      await saveBudgetLimits(request, body.month ?? "", changes);
      return Response.json({ ok: true });
    }

    if (body.action === "create") {
      if ((body.scope !== "ours" && body.scope !== "mine") || typeof body.name !== "string") {
        throw new HttpError(400, "Choose where this category belongs.");
      }
      const item = await createBudgetCategory(request, { scope: body.scope, name: body.name, limitCents: body.limitCents ?? Number.NaN, month: body.month ?? "" });
      return Response.json({ ok: true, item });
    }

    throw new HttpError(400, "Unknown budget action.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the budget." }, { status });
  }
}
