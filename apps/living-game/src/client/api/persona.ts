import {
  parsePersonaApprovalResult,
  parsePersonaProfile,
  parsePersonaSnapshot,
  type PersonaApprovalResultV1,
  type PersonaDraftInputV1,
  type PersonaProfileV1,
  type PersonaSnapshotV1,
} from "@homebase/contracts";

export interface PersonaApi {
  load(): Promise<PersonaSnapshotV1>;
  save(input: PersonaDraftInputV1): Promise<PersonaProfileV1>;
  approve(): Promise<PersonaApprovalResultV1>;
}

export class PersonaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonaApiError";
  }
}

function recordAt(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null ? input as Record<string, unknown> : null;
}

function safeError(input: unknown, fallback: string) {
  const record = recordAt(input);
  if (!record || Object.keys(record).some((key) => key !== "error")) return fallback;
  const message = typeof record.error === "string" ? record.error.trim() : "";
  if (message.length < 1 || message.length > 200 || [...message].some((character) => character.charCodeAt(0) < 32)) return fallback;
  return message;
}

async function responsePayload(response: Response, fallback: string) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PersonaApiError(fallback);
  }
  if (!response.ok) throw new PersonaApiError(safeError(payload, fallback));
  return payload;
}

export function createHttpPersonaApi(fetcher: typeof fetch = fetch): PersonaApi {
  return {
    async load() {
      const payload = await responsePayload(await fetcher("/api/personas/current", {
        credentials: "same-origin",
      }), "Unable to load your persona.");
      try {
        return parsePersonaSnapshot(payload);
      } catch {
        throw new PersonaApiError("The persona response could not be verified.");
      }
    },
    async save(input) {
      const payload = await responsePayload(await fetcher("/api/personas/current", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }), "Unable to save your persona.");
      try {
        return parsePersonaProfile(payload);
      } catch {
        throw new PersonaApiError("The saved persona could not be verified.");
      }
    },
    async approve() {
      const payload = await responsePayload(await fetcher("/api/personas/current/approve", {
        method: "POST",
        credentials: "same-origin",
      }), "Unable to approve your persona.");
      try {
        return parsePersonaApprovalResult(payload);
      } catch {
        throw new PersonaApiError("The approved persona could not be verified.");
      }
    },
  };
}
