import type { MoveCandidateSignals } from "@homebase/domain-game";

export const EMPTY_SIGNALS: MoveCandidateSignals = {
  urgency: 0,
  uncertainty: 0,
  dueSoon: 0,
  preference: 0,
  cooperative: 0,
  comeback: 0,
  effort: 0,
  repetition: 0,
};

export function boundedTitle(value: string, maximum: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maximum) return normalized;
  return normalized.slice(0, Math.max(1, maximum - 1)).trimEnd() + "…";
}

export function daysBefore(localDate: string, earlierDate: string) {
  const current = Date.parse(`${localDate}T00:00:00.000Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00.000Z`);
  if (!Number.isFinite(current) || !Number.isFinite(earlier)) return 0;
  return Math.max(0, Math.floor((current - earlier) / 86_400_000));
}
