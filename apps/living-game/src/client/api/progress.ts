import { parseProgressSnapshot, type ProgressSnapshotV1 } from "@homebase/contracts";

export interface ProgressApi {
  load(): Promise<ProgressSnapshotV1>;
}

export class ProgressApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressApiError";
  }
}

function recordAt(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null
    ? input as Record<string, unknown>
    : null;
}

function safeError(input: unknown) {
  const record = recordAt(input);
  if (!record || Object.keys(record).some((key) => key !== "error")) return "Unable to load progress.";
  const message = typeof record.error === "string" ? record.error.trim() : "";
  if (
    message.length < 1
    || message.length > 200
    || [...message].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  ) return "Unable to load progress.";
  return message;
}

export function createHttpProgressApi(fetcher: typeof fetch = fetch): ProgressApi {
  return {
    async load() {
      const response = await fetcher("/api/game/progress", { credentials: "same-origin" });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ProgressApiError("Unable to load progress.");
      }
      if (!response.ok) throw new ProgressApiError(safeError(payload));
      try {
        return parseProgressSnapshot(payload);
      } catch {
        throw new ProgressApiError("The progress response could not be verified.");
      }
    },
  };
}
