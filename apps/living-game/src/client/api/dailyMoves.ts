import {
  parseDailyMove,
  parseGameEvent,
  parseMoveCompletionOptions,
  parseProgressBalance,
  type DailyMoveV1,
  type MoveCompletionOptionsV1,
} from "@homebase/contracts";

export type CompleteMoveInput =
  | Record<string, never>
  | { value: number }
  | { categoryId: string; createRule: boolean };

export interface DailyMovesApi {
  load(localDate: string): Promise<DailyMoveV1[]>;
  complete(moveId: string, input: CompleteMoveInput): Promise<DailyMoveV1>;
  defer(moveId: string): Promise<DailyMoveV1>;
  replace(moveId: string): Promise<DailyMoveV1>;
  options(moveId: string): Promise<MoveCompletionOptionsV1>;
}

export class DailyMovesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyMovesApiError";
  }
}

function plainRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null
    ? input as Record<string, unknown>
    : null;
}

function serverError(input: unknown, fallback: string) {
  const record = plainRecord(input);
  if (!record || Object.keys(record).some((key) => key !== "error")) return fallback;
  const message = record.error;
  if (typeof message !== "string") return fallback;
  const normalized = message.trim();
  if (
    normalized.length < 1
    || normalized.length > 200
    || [...normalized].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  ) return fallback;
  return normalized;
}

async function responseJson(response: Response, fallback: string) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DailyMovesApiError(fallback);
  }
  if (!response.ok) throw new DailyMovesApiError(serverError(payload, fallback));
  return payload;
}

function parseMoveEnvelope(input: unknown) {
  const record = plainRecord(input);
  if (!record || Object.keys(record).some((key) => key !== "move") || !("move" in record)) {
    throw new DailyMovesApiError("The move response could not be verified.");
  }
  try {
    return parseDailyMove(record.move);
  } catch {
    throw new DailyMovesApiError("The move response could not be verified.");
  }
}

function parseCompletionEnvelope(input: unknown) {
  const record = plainRecord(input);
  if (!record || Object.keys(record).some((key) => !["move", "event", "balances"].includes(key))) {
    throw new DailyMovesApiError("The completion response could not be verified.");
  }
  try {
    const move = parseDailyMove(record.move);
    if (record.event !== null) parseGameEvent(record.event);
    if (!Array.isArray(record.balances)) throw new Error("invalid balances");
    record.balances.forEach(parseProgressBalance);
    return move;
  } catch {
    throw new DailyMovesApiError("The completion response could not be verified.");
  }
}

export function createHttpDailyMovesApi(fetcher: typeof fetch = fetch): DailyMovesApi {
  async function post(path: string, body?: CompleteMoveInput) {
    return fetcher(path, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  return {
    async load(localDate) {
      const response = await fetcher(`/api/game/moves?date=${encodeURIComponent(localDate)}`, {
        credentials: "same-origin",
      });
      const payload = await responseJson(response, "Unable to load today’s moves.");
      const record = plainRecord(payload);
      if (!record || Object.keys(record).some((key) => key !== "moves") || !Array.isArray(record.moves)) {
        throw new DailyMovesApiError("The daily moves response could not be verified.");
      }
      try {
        return record.moves.map(parseDailyMove);
      } catch {
        throw new DailyMovesApiError("The daily moves response could not be verified.");
      }
    },
    async complete(moveId, input) {
      const response = await post(`/api/game/moves/${encodeURIComponent(moveId)}/complete`, input);
      return parseCompletionEnvelope(await responseJson(response, "Unable to complete the move."));
    },
    async defer(moveId) {
      const response = await post(`/api/game/moves/${encodeURIComponent(moveId)}/defer`);
      return parseMoveEnvelope(await responseJson(response, "Unable to defer the move."));
    },
    async replace(moveId) {
      const response = await post(`/api/game/moves/${encodeURIComponent(moveId)}/replace`);
      return parseMoveEnvelope(await responseJson(response, "Unable to replace the move."));
    },
    async options(moveId) {
      const response = await fetcher(`/api/game/moves/${encodeURIComponent(moveId)}/options`, {
        credentials: "same-origin",
      });
      const payload = await responseJson(response, "Unable to load completion options.");
      try {
        return parseMoveCompletionOptions(payload);
      } catch {
        throw new DailyMovesApiError("The completion options could not be verified.");
      }
    },
  };
}
