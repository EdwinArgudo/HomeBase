import { HttpError } from "../auth/identity.ts";

/**
 * Translates a thrown value into a JSON error response.
 *
 * Only `HttpError` carries a message the caller is allowed to read. Anything
 * else is an internal failure, so it answers 500 with the supplied fallback
 * rather than leaking the underlying message to the browser.
 */
export function errorResponse(error: unknown, fallback: string): Response {
  const safe = error instanceof HttpError;
  return Response.json(
    { error: safe ? error.message : fallback },
    { status: safe ? error.status : 500 },
  );
}

type JsonBodyOptions<T> = {
  /** Maximum accepted body length in characters. */
  limit: number;
  /** Answered when the body exceeds `limit`. */
  tooLarge: string;
  /** Answered when the body is not JSON, or `parse` rejects it. */
  invalid: string;
  /** Validates and narrows the parsed value. Throwing is treated as `invalid`. */
  parse?: (value: unknown) => T;
  /** Supplies a value for an empty body. Without it, an empty body is invalid. */
  whenEmpty?: () => T;
};

/**
 * Reads a size-capped JSON request body.
 *
 * The cap is applied before parsing so an oversized body is rejected without
 * being walked, and every rejection is a 400 the caller can act on.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  options: JsonBodyOptions<T>,
): Promise<T> {
  const text = await request.text();
  if (text.length > options.limit) throw new HttpError(400, options.tooLarge);
  if (options.whenEmpty && !text.trim()) return options.whenEmpty();

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, options.invalid);
  }

  if (!options.parse) return value as T;
  try {
    return options.parse(value);
  } catch {
    throw new HttpError(400, options.invalid);
  }
}

/** Reads and bounds a route parameter that addresses a single record. */
export async function requireRouteId(
  params: Promise<{ id: string }> | { id: string },
  message: string,
): Promise<string> {
  const { id } = await params;
  if (!id || id.length > 128) throw new HttpError(400, message);
  return id;
}
