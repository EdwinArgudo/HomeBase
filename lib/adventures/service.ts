import {
  parseAdventureSnapshot,
  type AdventureSnapshotV1,
  type WorldAdventureV1,
} from "@homebase/contracts";
import {
  ADVENTURE_LENGTH_DAYS,
  adventureEndsAtV1,
  adventureIsCompleteV1,
  adventureTemplateV1,
  offeredAdventureTemplateV1,
  type AdventureTemplateV1,
} from "@homebase/domain-game";

import { HttpError } from "../auth/identity.ts";
import type { HouseholdContext } from "../household/types.ts";

type AdventureRow = {
  id: string;
  template_key: string;
  status: string;
  starts_at: string;
  ends_at: string;
  completed_at: string | null;
};

const ADVENTURE_FIELDS = "id, template_key, status, starts_at, ends_at, completed_at";

/**
 * How far a household has come, counted from the shared moves themselves rather
 * than from a running total. Nothing to drift, and it replays identically.
 * Private moves never count: an adventure is something you did together.
 */
async function contributions(
  context: HouseholdContext,
  template: AdventureTemplateV1,
  row: AdventureRow,
): Promise<number> {
  const result = await context.db.prepare(`SELECT COUNT(*) AS contributions
    FROM game_events
    WHERE household_id = ? AND event_type = 'daily_move.completed' AND payload_version = 1
      AND visibility IN ('household', 'display')
      AND json_extract(payload_json, '$.ownership') = 'shared'
      AND json_extract(payload_json, '$.family') = ?
      AND occurred_at >= ? AND occurred_at < ?`)
    .bind(context.member.household_id, template.family, row.starts_at, row.ends_at)
    .first<{ contributions: number }>();
  return Math.max(0, Number(result?.contributions ?? 0));
}

function adventureFrom(
  row: AdventureRow,
  template: AdventureTemplateV1,
  currentValue: number,
  status: WorldAdventureV1["status"],
): WorldAdventureV1 {
  return {
    id: row.id,
    title: template.title,
    status,
    targetValue: template.targetValue,
    currentValue: Math.min(currentValue, template.targetValue),
    endsAt: row.ends_at,
    visibility: "household",
  };
}

function offeredAdventure(template: AdventureTemplateV1, generatedAt: string): WorldAdventureV1 {
  return {
    id: `offer:${template.key}`,
    title: template.title,
    status: "offered",
    targetValue: template.targetValue,
    currentValue: 0,
    endsAt: adventureEndsAtV1(generatedAt),
    visibility: "household",
  };
}

/**
 * Reads the household's adventure, settling anything the passage of time has
 * already decided: a finished one is marked complete, and one whose week ran
 * out simply expires. Expiring costs nothing — it is not a missed deadline,
 * just a week that went differently.
 */
export async function loadAndSettleAdventures(
  context: HouseholdContext,
  generatedAt: string,
): Promise<AdventureSnapshotV1> {
  const activeRow = await context.db.prepare(`SELECT ${ADVENTURE_FIELDS}
    FROM adventures WHERE household_id = ? AND status = 'active' LIMIT 1`)
    .bind(context.member.household_id)
    .first<AdventureRow>();

  let active: WorldAdventureV1 | null = null;
  if (activeRow) {
    const template = adventureTemplateV1(activeRow.template_key);
    if (template) {
      const current = await contributions(context, template, activeRow);
      if (adventureIsCompleteV1(template, current)) {
        await context.db.batch([
          context.db.prepare(`UPDATE adventures SET status = 'complete', completed_at = ?
            WHERE id = ? AND household_id = ? AND status = 'active'`)
            .bind(generatedAt, activeRow.id, context.member.household_id),
          context.db.prepare(`INSERT OR IGNORE INTO game_events (
            id, household_id, member_id, event_type, source_type, source_id, visibility,
            payload_version, payload_json, idempotency_key, occurred_at, created_at
          ) VALUES (?, ?, NULL, 'adventure.completed', 'adventure', ?, 'household', 1, ?, ?, ?, ?)`)
            .bind(
              `adventure-completed:${activeRow.id}`,
              context.member.household_id,
              activeRow.id,
              JSON.stringify({ templateKey: template.key, targetValue: template.targetValue }),
              `adventure.completed:${activeRow.id}:v1`,
              generatedAt,
              generatedAt,
            ),
        ]);
      } else if (Date.parse(activeRow.ends_at) <= Date.parse(generatedAt)) {
        await context.db.prepare(`UPDATE adventures SET status = 'expired'
          WHERE id = ? AND household_id = ? AND status = 'active'`)
          .bind(activeRow.id, context.member.household_id)
          .run();
      } else {
        active = adventureFrom(activeRow, template, current, "active");
      }
    }
  }

  const finishedRows = await context.db.prepare(`SELECT ${ADVENTURE_FIELDS}
    FROM adventures
    WHERE household_id = ? AND status IN ('complete', 'expired')
    ORDER BY ends_at DESC
    LIMIT 6`)
    .bind(context.member.household_id)
    .all<AdventureRow>();

  const finished: WorldAdventureV1[] = [];
  for (const row of finishedRows.results) {
    const template = adventureTemplateV1(row.template_key);
    if (!template) continue;
    const current = await contributions(context, template, row);
    finished.push(adventureFrom(row, template, current, row.status === "complete" ? "complete" : "expired"));
  }

  return parseAdventureSnapshot({
    contractVersion: 1,
    householdId: context.member.household_id,
    generatedAt,
    active,
    offered: active ? null : offeredAdventure(offeredAdventureTemplateV1(generatedAt.slice(0, 10)), generatedAt),
    finished,
  });
}

/**
 * Starting one is explicit and belongs to the household, so either member may
 * begin it and both then see the same week.
 */
export async function acceptAdventure(
  context: HouseholdContext,
  templateKey: string,
  options: { createId: () => string; generatedAt: string },
): Promise<AdventureSnapshotV1> {
  const template = adventureTemplateV1(templateKey);
  if (!template) throw new HttpError(404, "That adventure is no longer on offer.");

  const offered = offeredAdventureTemplateV1(options.generatedAt.slice(0, 10));
  if (offered.key !== template.key) throw new HttpError(409, "A different adventure is on offer this week.");

  await context.db.prepare(`INSERT OR IGNORE INTO adventures (
    id, household_id, template_key, status, starts_at, ends_at, completed_at, created_at
  ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?)`)
    .bind(
      options.createId(),
      context.member.household_id,
      template.key,
      options.generatedAt,
      adventureEndsAtV1(options.generatedAt),
      options.generatedAt,
    )
    .run();

  const snapshot = await loadAndSettleAdventures(context, options.generatedAt);
  if (!snapshot.active) throw new HttpError(409, "An adventure is already under way.");
  return snapshot;
}

export { ADVENTURE_LENGTH_DAYS };
