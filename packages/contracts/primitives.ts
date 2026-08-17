/**
 * The validation kernel every contract parser is built from.
 *
 * Nothing here is part of the package's public surface except the error type,
 * its result union, and `safeParse`. The rest is shared between the domain
 * modules and re-exported only through them.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ContractErrorCode =
  | "invalid_type"
  | "invalid_value"
  | "missing_field"
  | "unknown_field"
  | "duplicate"
  | "unsupported_version"
  | "not_json_safe";

export class ContractValidationError extends Error {
  readonly path: string;
  readonly code: ContractErrorCode;

  constructor(path: string, expected: string, code: ContractErrorCode = "invalid_value") {
    super(`${path}: ${expected}`);
    this.name = "ContractValidationError";
    this.path = path;
    this.code = code;
  }
}

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ContractValidationError };

export function safeParse<T>(parser: (input: unknown) => T, input: unknown): ContractValidationResult<T> {
  try {
    return { ok: true, value: parser(input) };
  } catch (error) {
    if (error instanceof ContractValidationError) return { ok: false, error };
    return { ok: false, error: new ContractValidationError("$", "could not be validated", "invalid_value") };
  }
}

export type UnknownRecord = Record<string, unknown>;

export function fail(path: string, expected: string, code: ContractErrorCode = "invalid_value"): never {
  throw new ContractValidationError(path, expected, code);
}

export function fieldPath(path: string, key: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key) ? `${path}.${key}` : `${path}.[field]`;
}

export function objectAt(input: unknown, path: string, keys: readonly string[]): UnknownRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fail(path, "must be an object", "invalid_type");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(path, "must be a plain JSON object", "not_json_safe");
  }
  const record = input as UnknownRecord;
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    return fail(path, "contains an unsupported field", "unknown_field");
  }
  return record;
}

export function required(record: UnknownRecord, key: string, path: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return fail(fieldPath(path, key), "is required", "missing_field");
  }
  return record[key];
}

export function stringAt(input: unknown, path: string, minimum = 1, maximum = 128) {
  if (typeof input !== "string") return fail(path, "must be a string", "invalid_type");
  if (input.length < minimum || input.length > maximum) return fail(path, `must contain ${minimum} to ${maximum} characters`);
  return input;
}

export function idAt(input: unknown, path: string) {
  const value = stringAt(input, path, 1, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return fail(path, "must be a stable identifier");
  return value;
}

export function enumAt<const T extends readonly string[]>(input: unknown, path: string, values: T): T[number] {
  if (typeof input !== "string" || !values.includes(input)) return fail(path, `must be one of ${values.join(", ")}`);
  return input as T[number];
}

export function integerAt(input: unknown, path: string, minimum: number, maximum: number) {
  if (typeof input !== "number" || !Number.isInteger(input)) return fail(path, "must be an integer", "invalid_type");
  if (input < minimum || input > maximum) return fail(path, `must be between ${minimum} and ${maximum}`);
  return input;
}

export function booleanAt(input: unknown, path: string) {
  if (typeof input !== "boolean") return fail(path, "must be a boolean", "invalid_type");
  return input;
}

export function literalTrueAt(input: unknown, path: string): true {
  if (input !== true) return fail(path, "must be true");
  return true;
}

export function nullableIdAt(input: unknown, path: string) {
  return input === null ? null : idAt(input, path);
}

export function timestampAt(input: unknown, path: string) {
  const value = stringAt(input, path, 20, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return fail(path, "must be an ISO-8601 timestamp");
  return value;
}

export function nullableTimestampAt(input: unknown, path: string) {
  return input === null ? null : timestampAt(input, path);
}

export function localDateAt(input: unknown, path: string) {
  const value = stringAt(input, path, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(path, "must be a calendar date in YYYY-MM-DD format");
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    return fail(path, "must be a calendar date in YYYY-MM-DD format");
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return fail(path, "must be a calendar date in YYYY-MM-DD format");
  return value;
}

export function arrayAt(input: unknown, path: string, minimum: number, maximum: number) {
  if (!Array.isArray(input)) return fail(path, "must be an array", "invalid_type");
  if (input.length < minimum || input.length > maximum) return fail(path, `must contain ${minimum} to ${maximum} entries`);
  return input;
}

export function versionAt(input: unknown, path: string, version: number) {
  if (input !== version) return fail(path, `must be supported version ${version}`, "unsupported_version");
  return version;
}

export function uniqueBy<T>(values: T[], key: (value: T) => string, path: string, suffix: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const current = key(value);
    if (seen.has(current)) fail(`${path}[${index}].${suffix}`, "must be unique", "duplicate");
    seen.add(current);
  });
}

export function assertJsonValue(input: unknown, path: string, ancestors = new Set<object>(), depth = 0): asserts input is JsonValue {
  if (depth > 12) return fail(path, "must not exceed 12 nested levels", "not_json_safe");
  if (input === null || typeof input === "string" || typeof input === "boolean") return;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return fail(path, "must contain only finite numbers", "not_json_safe");
    return;
  }
  if (typeof input !== "object") return fail(path, "must contain only JSON-safe values", "not_json_safe");
  if (ancestors.has(input)) return fail(path, "must not contain cycles", "not_json_safe");
  const prototype = Object.getPrototypeOf(input);
  if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) {
    return fail(path, "must contain only plain JSON objects", "not_json_safe");
  }
  ancestors.add(input);
  if (Array.isArray(input)) {
    input.forEach((value, index) => assertJsonValue(value, `${path}[${index}]`, ancestors, depth + 1));
  } else {
    Object.entries(input).forEach(([key, value]) => assertJsonValue(value, fieldPath(path, key), ancestors, depth + 1));
  }
  ancestors.delete(input);
}

export function sourceAt<T extends readonly string[]>(input: unknown, path: string, sourceTypes: T) {
  const record = objectAt(input, path, ["type", "id"]);
  return {
    type: enumAt(required(record, "type", path), `${path}.type`, sourceTypes),
    id: idAt(required(record, "id", path), `${path}.id`),
  };
}
