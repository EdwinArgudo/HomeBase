/**
 * Operational signal, emitted as one structured line per event so the hosting
 * platform's log stream is queryable without a metrics service.
 *
 * The rule is the same as the audit trail's, and stricter in one way: a log
 * line travels further than a database row, so nothing identifying a household,
 * a member, or a purchase ever goes in one. Durations and counts, not people.
 */
export const TELEMETRY_EVENTS = [
  "daily_moves.materialized",
  "daily_move.completed",
  "daily_move.deferred",
  "daily_move.replaced",
  "world.projected",
  "plaid.sync",
] as const;

export type TelemetryEvent = typeof TELEMETRY_EVENTS[number];

export type TelemetryFields = Record<string, number | boolean | string>;

const SAFE_STRING = /^[\w.:-]{1,40}$/;
const FORBIDDEN_KEY = /household|member|email|merchant|amount|cents|token|secret|name|id$/i;

function safeFields(fields: TelemetryFields) {
  const safe: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = Math.round(value * 100) / 100;
    else if (typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && SAFE_STRING.test(value)) safe[key] = value;
  }
  return safe;
}

export function buildTelemetryRecord(event: TelemetryEvent, fields: TelemetryFields = {}) {
  return { telemetry: event, ...safeFields(fields) };
}

export function recordTelemetry(event: TelemetryEvent, fields: TelemetryFields = {}) {
  // The platform log stream is the metrics sink.
  console.log(JSON.stringify(buildTelemetryRecord(event, fields)));
}

/** Times an operation and reports how long it took, whichever way it ends. */
export async function withTelemetry<T>(
  event: TelemetryEvent,
  fields: () => TelemetryFields,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    recordTelemetry(event, { ...fields(), durationMs: Date.now() - startedAt, ok: true });
    return result;
  } catch (error) {
    recordTelemetry(event, { ...fields(), durationMs: Date.now() - startedAt, ok: false });
    throw error;
  }
}
