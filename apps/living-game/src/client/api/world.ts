import { parseWorldProjection, type WorldProjectionV1 } from "@homebase/contracts";

export interface WorldApi {
  load(): Promise<WorldProjectionV1>;
}

export class WorldApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldApiError";
  }
}

function safeError(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "Unable to load the household world.";
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "error")) return "Unable to load the household world.";
  const message = typeof record.error === "string" ? record.error.trim() : "";
  if (!message || message.length > 200 || [...message].some((character) => character.charCodeAt(0) < 32)) return "Unable to load the household world.";
  return message;
}

export function createHttpWorldApi(fetcher: typeof fetch = fetch): WorldApi {
  return {
    async load() {
      const response = await fetcher("/api/world", { credentials: "same-origin" });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new WorldApiError("Unable to load the household world.");
      }
      if (!response.ok) throw new WorldApiError(safeError(payload));
      try {
        return parseWorldProjection(payload);
      } catch {
        throw new WorldApiError("The household world response could not be verified.");
      }
    },
  };
}
