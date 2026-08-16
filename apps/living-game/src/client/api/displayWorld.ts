import { parseWorldProjection, type WorldProjectionV1 } from "@homebase/contracts";

import { displayWorldFixture } from "../fixtures/game";

export interface DisplayWorldApi {
  load(): Promise<WorldProjectionV1>;
}

export class DisplayWorldApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisplayWorldApiError";
  }
}

export function createHttpDisplayWorldApi(): DisplayWorldApi {
  return {
    async load() {
      const fallback = "The display is unavailable right now.";
      const response = await fetch("/api/display/world", { headers: { accept: "application/json" } });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new DisplayWorldApiError(fallback);
      }
      if (!response.ok) {
        const data = body as Record<string, unknown> | null;
        const message = data && typeof data.error === "string" ? data.error.trim() : "";
        throw new DisplayWorldApiError(message.length > 0 && message.length <= 200 ? message : fallback);
      }
      const projection = parseWorldProjection(body);
      // The contract already rejects non-display entities; this keeps the
      // guarantee visible at the boundary the display actually reads from.
      if (projection.viewer !== "display") throw new DisplayWorldApiError(fallback);
      return projection;
    },
  };
}

export function createFixtureDisplayWorldApi(): DisplayWorldApi {
  return {
    async load() {
      return displayWorldFixture;
    },
  };
}
