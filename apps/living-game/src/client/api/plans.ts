import { parsePlansAction, parsePlansSnapshot, type PlansActionV1, type PlansSnapshotV1 } from "@homebase/contracts";

export interface PlansApi { load(): Promise<PlansSnapshotV1>; act(action: PlansActionV1): Promise<PlansSnapshotV1>; }
export class PlansApiError extends Error { constructor(message: string) { super(message); this.name = "PlansApiError"; } }

function safeMessage(input: unknown, fallback: string) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fallback;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "error")) return fallback;
  const message = typeof record.error === "string" ? record.error.trim() : "";
  return message.length > 0 && message.length <= 200 && ![...message].some((character) => character.charCodeAt(0) < 32) ? message : fallback;
}

async function snapshotFrom(response: Response, fallback: string) {
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new PlansApiError(fallback); }
  if (!response.ok) throw new PlansApiError(safeMessage(payload, fallback));
  try { return parsePlansSnapshot(payload); } catch { throw new PlansApiError("The plans response could not be verified."); }
}

export function createHttpPlansApi(fetcher: typeof fetch = fetch): PlansApi {
  return {
    async load() { return snapshotFrom(await fetcher("/api/plans", { credentials: "same-origin" }), "Unable to load your plans."); },
    async act(input) {
      const action = parsePlansAction(input);
      return snapshotFrom(await fetcher("/api/plans", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
      }), "Unable to update your plans.");
    },
  };
}
