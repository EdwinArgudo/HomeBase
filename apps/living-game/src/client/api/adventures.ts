import { parseAdventureSnapshot, type AdventureSnapshotV1 } from "@homebase/contracts";

import { ADVENTURE_TEMPLATES_V1 } from "@homebase/domain-game";

export interface AdventuresApi {
  load(): Promise<AdventureSnapshotV1>;
  accept(templateKey: string): Promise<AdventureSnapshotV1>;
}

export class AdventuresApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdventuresApiError";
  }
}

async function readSnapshot(response: Response, fallback: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdventuresApiError(fallback);
  }
  if (!response.ok) {
    const data = body as Record<string, unknown> | null;
    const message = data && typeof data.error === "string" ? data.error.trim() : "";
    throw new AdventuresApiError(message.length > 0 && message.length <= 200 ? message : fallback);
  }
  return parseAdventureSnapshot(body);
}

/** The template behind an adventure, for the description the contract omits. */
export function adventureDescription(title: string): string {
  return ADVENTURE_TEMPLATES_V1.find((template) => template.title === title)?.description ?? "";
}

export function createHttpAdventuresApi(): AdventuresApi {
  return {
    async load() {
      const response = await fetch("/api/game/adventures", { headers: { accept: "application/json" } });
      return readSnapshot(response, "Unable to load your adventures.");
    },
    async accept(templateKey) {
      const response = await fetch("/api/game/adventures", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ templateKey }),
      });
      return readSnapshot(response, "Unable to begin that adventure.");
    },
  };
}

export function createFixtureAdventuresApi(): AdventuresApi {
  const template = ADVENTURE_TEMPLATES_V1[0]!;
  let snapshot: AdventureSnapshotV1 = parseAdventureSnapshot({
    contractVersion: 1,
    householdId: "household-homebase",
    generatedAt: "2026-08-16T09:00:00.000Z",
    active: null,
    offered: {
      id: `offer:${template.key}`,
      title: template.title,
      status: "offered",
      targetValue: template.targetValue,
      currentValue: 0,
      endsAt: "2026-08-23T09:00:00.000Z",
      visibility: "household",
    },
    finished: [{
      id: "adventure-past",
      title: ADVENTURE_TEMPLATES_V1[1]!.title,
      status: "complete",
      targetValue: ADVENTURE_TEMPLATES_V1[1]!.targetValue,
      currentValue: ADVENTURE_TEMPLATES_V1[1]!.targetValue,
      endsAt: "2026-08-09T09:00:00.000Z",
      visibility: "household",
    }],
  });

  return {
    async load() {
      return snapshot;
    },
    async accept() {
      snapshot = parseAdventureSnapshot({
        ...snapshot,
        active: {
          id: "adventure-active",
          title: template.title,
          status: "active",
          targetValue: template.targetValue,
          currentValue: 1,
          endsAt: "2026-08-23T09:00:00.000Z",
          visibility: "household",
        },
        offered: null,
      });
      return snapshot;
    },
  };
}
