import {
  parsePersonaApprovalResult,
  parsePersonaProfile,
  parsePersonaSnapshot,
  type PersonaProfileV1,
} from "@homebase/contracts";

import { worldFixture } from "../fixtures/game";
import type { PersonaApi } from "./persona";

export function createFixturePersonaApi(): PersonaApi {
  let persona: PersonaProfileV1 | null = parsePersonaProfile({
    contractVersion: 1,
    id: "persona-edwin",
    householdId: "household-homebase",
    memberId: "member-edwin",
    displayName: "Edwin",
    creationMethod: "manual",
    status: "ready",
    baseStyleVersion: "homebase-pixel-v1",
    appearance: { skinPalette: "warm", hairStyle: "short", hairColor: "espresso", outfit: "mint", accent: "none" },
    visibility: "household",
    manifest: worldFixture.personas[0]!.manifest,
    approvedAt: "2026-08-15T12:00:00.000Z",
    createdAt: "2026-08-15T12:00:00.000Z",
    updatedAt: "2026-08-15T12:00:00.000Z",
  });
  return {
    async load() {
      return parsePersonaSnapshot({
        contractVersion: 1,
        householdId: "household-homebase",
        memberId: "member-edwin",
        persona,
        generatedAt: new Date().toISOString(),
      });
    },
    async save(input) {
      persona = parsePersonaProfile({
        ...(persona ?? {}),
        contractVersion: 1,
        id: persona?.id ?? "persona-edwin",
        householdId: "household-homebase",
        memberId: "member-edwin",
        displayName: input.displayName,
        creationMethod: "manual",
        status: "draft",
        baseStyleVersion: "homebase-pixel-v1",
        appearance: input.appearance,
        visibility: input.visibility,
        manifest: worldFixture.personas[0]!.manifest,
        approvedAt: null,
        createdAt: persona?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return persona;
    },
    async approve() {
      if (!persona) throw new Error("Create and save your persona before approving it.");
      const timestamp = new Date().toISOString();
      persona = parsePersonaProfile({ ...persona, status: "ready", approvedAt: timestamp, updatedAt: timestamp });
      return parsePersonaApprovalResult({
        contractVersion: 1,
        persona,
        event: {
          contractVersion: 1,
          id: `persona-approved:${persona.id}`,
          householdId: persona.householdId,
          memberId: persona.memberId,
          eventType: "persona.approved",
          source: { type: "persona", id: persona.id },
          visibility: persona.visibility,
          payload: { version: 1, data: { personaId: persona.id } },
          idempotencyKey: `persona.approved:${persona.id}:v1`,
          occurredAt: timestamp,
          createdAt: timestamp,
        },
      });
    },
  };
}
