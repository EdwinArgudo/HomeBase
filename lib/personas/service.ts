import {
  REQUIRED_ANIMATIONS,
  parseGameEvent,
  parsePersonaApprovalResult,
  parsePersonaAppearance,
  parsePersonaDraftInput,
  parsePersonaProfile,
  parsePersonaSnapshot,
  type GameEventV1,
  type PersonaApprovalResultV1,
  type PersonaDraftInputV1,
  type PersonaManifestV1,
  type PersonaProfileV1,
  type PersonaSnapshotV1,
} from "@homebase/contracts";

import { HttpError } from "../auth/identity.ts";
import { auditEventStatement } from "../observability/audit.ts";
import type { HouseholdContext } from "../household/types.ts";

const BASE_STYLE_VERSION = "homebase-pixel-v1";

type PersonaRow = {
  id: string;
  household_id: string;
  member_id: string;
  display_name: string;
  creation_method: string;
  status: string;
  base_style_version: string;
  appearance_json: string;
  visibility: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  household_id: string;
  member_id: string | null;
  event_type: string;
  source_type: string;
  source_id: string;
  visibility: string;
  payload_version: number;
  payload_json: string;
  idempotency_key: string;
  occurred_at: string;
  created_at: string;
};

export function createManualPersonaManifest(personaId: string, baseStyleVersion = BASE_STYLE_VERSION): PersonaManifestV1 {
  const sheetId = `${personaId}:sheet`;
  return {
    manifestVersion: 1,
    personaId,
    baseStyleVersion,
    grid: { frameWidth: 32, frameHeight: 48, columns: 4, rows: 2 },
    assets: [
      { id: `${personaId}:portrait`, kind: "portrait", width: 64, height: 64, transparent: true },
      { id: `${personaId}:neutral`, kind: "neutral", width: 32, height: 48, transparent: true },
      { id: sheetId, kind: "sprite_sheet", width: 128, height: 96, transparent: true },
    ],
    animations: REQUIRED_ANIMATIONS.map((name, index) => ({
      name,
      assetId: sheetId,
      loop: name !== "celebrate",
      frames: [{ column: index % 4, row: Math.floor(index / 4), durationMs: 160 }],
    })),
    attachmentAnchors: [
      { kind: "hair", x: 16, y: 4 },
      { kind: "clothing", x: 16, y: 28 },
      { kind: "accessory", x: 25, y: 18 },
      { kind: "prop", x: 30, y: 30 },
    ],
  };
}

function profileFromRow(row: PersonaRow): PersonaProfileV1 {
  let appearance: unknown;
  try {
    appearance = JSON.parse(row.appearance_json);
  } catch {
    throw new Error("Stored persona appearance is invalid.");
  }
  return parsePersonaProfile({
    contractVersion: 1,
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    displayName: row.display_name,
    creationMethod: row.creation_method,
    status: row.status,
    baseStyleVersion: row.base_style_version,
    appearance: parsePersonaAppearance(appearance),
    visibility: row.visibility,
    manifest: createManualPersonaManifest(row.id),
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function eventFromRow(row: EventRow): GameEventV1 {
  return parseGameEvent({
    contractVersion: 1,
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    eventType: row.event_type,
    source: { type: row.source_type, id: row.source_id },
    visibility: row.visibility,
    payload: { version: row.payload_version, data: JSON.parse(row.payload_json) as unknown },
    idempotencyKey: row.idempotency_key,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  });
}

const PERSONA_FIELDS = `id, household_id, member_id, display_name, creation_method,
  status, base_style_version, appearance_json, visibility, approved_at, created_at, updated_at`;

export async function readCurrentPersona(context: HouseholdContext): Promise<PersonaProfileV1 | null> {
  const row = await context.db.prepare(`SELECT ${PERSONA_FIELDS}
    FROM personas
    WHERE household_id = ? AND member_id = ? AND deleted_at IS NULL
    LIMIT 1`)
    .bind(context.member.household_id, context.member.id)
    .first<PersonaRow>();
  return row ? profileFromRow(row) : null;
}

export async function loadCurrentPersonaSnapshot(
  context: HouseholdContext,
  generatedAt: string,
): Promise<PersonaSnapshotV1> {
  return parsePersonaSnapshot({
    contractVersion: 1,
    householdId: context.member.household_id,
    memberId: context.member.id,
    persona: await readCurrentPersona(context),
    generatedAt,
  });
}

export async function saveManualPersona(
  context: HouseholdContext,
  input: PersonaDraftInputV1,
  options: { createId: () => string; updatedAt: string },
): Promise<PersonaProfileV1> {
  const draft = parsePersonaDraftInput(input);
  const existing = await readCurrentPersona(context);
  if (existing?.status === "ready" && existing.visibility !== draft.visibility) {
    throw new HttpError(409, "Persona visibility cannot change after approval.");
  }
  const personaId = options.createId();
  const appearanceJson = JSON.stringify(draft.appearance);
  const visibilityChanged = existing !== null && existing.visibility !== draft.visibility;
  await context.db.batch([
    ...(visibilityChanged
      ? [auditEventStatement(context.db, {
        householdId: context.member.household_id,
        memberId: context.member.id,
        action: "persona.visibility_changed",
        subjectType: "persona",
        subjectId: existing.id,
        metadata: { visibility: draft.visibility },
        occurredAt: options.updatedAt,
      })]
      : []),
    context.db.prepare(`INSERT OR IGNORE INTO personas (
      id, household_id, member_id, display_name, creation_method, status,
      base_style_version, appearance_json, active_loadout_json, visibility,
      approved_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, 'manual', 'draft', ?, ?, '{}', ?, NULL, ?, ?, NULL)`)
      .bind(personaId, context.member.household_id, context.member.id, draft.displayName,
        BASE_STYLE_VERSION, appearanceJson, draft.visibility, options.updatedAt, options.updatedAt),
    context.db.prepare(`UPDATE personas
      SET display_name = ?, appearance_json = ?, visibility = ?, updated_at = ?
      WHERE household_id = ? AND member_id = ? AND deleted_at IS NULL
        AND (status = 'draft' OR visibility = ?)`)
      .bind(draft.displayName, appearanceJson, draft.visibility, options.updatedAt,
        context.member.household_id, context.member.id, draft.visibility),
  ]);
  const saved = await readCurrentPersona(context);
  if (!saved) throw new Error("Persona save did not produce a record.");
  if (saved.visibility !== draft.visibility) throw new HttpError(409, "Persona visibility cannot change after approval.");
  return saved;
}

export async function approveCurrentPersona(
  context: HouseholdContext,
  occurredAt: string,
): Promise<PersonaApprovalResultV1> {
  const current = await readCurrentPersona(context);
  if (!current) throw new HttpError(404, "Create and save your persona before approving it.");
  const idempotencyKey = `persona.approved:${current.id}:v1`;
  const eventId = `persona-approved:${current.id}`;
  const payloadJson = JSON.stringify({ personaId: current.id });
  await context.db.batch([
    context.db.prepare(`UPDATE personas
      SET status = 'ready', approved_at = COALESCE(approved_at, ?), updated_at = ?
      WHERE id = ? AND household_id = ? AND member_id = ? AND deleted_at IS NULL
        AND status = 'draft'`)
      .bind(occurredAt, occurredAt, current.id, context.member.household_id, context.member.id),
    context.db.prepare(`INSERT OR IGNORE INTO game_events (
      id, household_id, member_id, event_type, source_type, source_id, visibility,
      payload_version, payload_json, idempotency_key, occurred_at, created_at
    ) SELECT ?, household_id, member_id, 'persona.approved', 'persona', id, visibility,
      1, ?, ?, ?, ?
      FROM personas
      WHERE id = ? AND household_id = ? AND member_id = ? AND deleted_at IS NULL`)
      .bind(eventId, payloadJson, idempotencyKey, occurredAt, occurredAt,
        current.id, context.member.household_id, context.member.id),
  ]);
  const [persona, event] = await Promise.all([
    readCurrentPersona(context),
    context.db.prepare(`SELECT id, household_id, member_id, event_type, source_type,
      source_id, visibility, payload_version, payload_json, idempotency_key, occurred_at, created_at
      FROM game_events
      WHERE household_id = ? AND member_id = ? AND source_type = 'persona'
        AND source_id = ? AND idempotency_key = ?
      LIMIT 1`)
      .bind(context.member.household_id, context.member.id, current.id, idempotencyKey)
      .first<EventRow>(),
  ]);
  if (!persona || !event) throw new Error("Persona approval did not produce an authoritative result.");
  return parsePersonaApprovalResult({ contractVersion: 1, persona, event: eventFromRow(event) });
}
