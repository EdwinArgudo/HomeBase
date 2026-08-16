import assert from "node:assert/strict";
import test from "node:test";

import {
  ContractValidationError,
  parseDailyMove,
  parseMoveCompletionOptions,
  parseGameEvent,
  parsePersonaManifest,
  parseProgressBalance,
  parseWorldProjection,
  safeParse,
} from "../index.ts";

const timestamp = "2026-08-15T12:00:00.000Z";

function copy(value) {
  return structuredClone(value);
}

function validDailyMove() {
  return {
    contractVersion: 1,
    id: "move-1",
    householdId: "household-1",
    memberId: "member-1",
    localDate: "2026-08-15",
    slot: 1,
    family: "tend",
    ownership: "shared",
    visibility: "household",
    source: { type: "transaction", id: "transaction-1" },
    title: "Review one transaction",
    shortLabel: "Review purchase",
    estimatedSeconds: 45,
    status: "active",
    selectionReasonCode: "urgent",
    movePolicyVersion: 1,
    completedAt: null,
    createdAt: timestamp,
  };
}

function validGameEvent() {
  return {
    contractVersion: 1,
    id: "event-1",
    householdId: "household-1",
    memberId: "member-1",
    eventType: "transaction.reviewed",
    source: { type: "transaction", id: "transaction-1" },
    visibility: "household",
    payload: {
      version: 1,
      data: {
        points: 4,
        labels: ["reviewed", "shared"],
        detail: { categoryChanged: true, note: null },
      },
    },
    idempotencyKey: "transaction-1:reviewed:v1",
    occurredAt: timestamp,
    createdAt: timestamp,
  };
}

function validProgressBalance() {
  return {
    contractVersion: 1,
    id: "progress-1",
    householdId: "household-1",
    memberId: "member-1",
    dimension: "tend",
    lifetimePoints: 42,
    level: 2,
    updatedAt: timestamp,
  };
}

function validPersonaManifest() {
  const animationNames = ["idle", "walk_down", "walk_up", "walk_left", "walk_right", "celebrate", "rest"];
  return {
    manifestVersion: 1,
    personaId: "persona-1",
    baseStyleVersion: "pixel-v1",
    grid: { frameWidth: 32, frameHeight: 48, columns: 4, rows: 2 },
    assets: [
      { id: "portrait-1", kind: "portrait", width: 64, height: 64, transparent: true },
      { id: "neutral-1", kind: "neutral", width: 32, height: 48, transparent: true },
      { id: "sheet-1", kind: "sprite_sheet", width: 128, height: 96, transparent: true },
    ],
    animations: animationNames.map((name, index) => ({
      name,
      assetId: "sheet-1",
      loop: name !== "celebrate",
      frames: [{ column: index % 4, row: Math.floor(index / 4), durationMs: 120 }],
    })),
    attachmentAnchors: [
      { kind: "hair", x: 16, y: 4 },
      { kind: "clothing", x: 16, y: 28 },
      { kind: "accessory", x: 25, y: 18 },
      { kind: "prop", x: 30, y: 30 },
    ],
  };
}

function validWorldProjection() {
  return {
    contractVersion: 1,
    worldVersion: 1,
    revision: 8,
    householdId: "household-1",
    viewer: "member",
    generatedAt: timestamp,
    scene: { key: "apartment-main", theme: "morning" },
    personas: [
      {
        id: "persona-1",
        displayName: "Edwin",
        altDescription: "Edwin's pixel persona tending the household ledger.",
        visibility: "household",
        activity: "tend",
        x: 35,
        y: 60,
        manifest: validPersonaManifest(),
      },
    ],
    items: [
      { id: "item-1", catalogKey: "ledger-desk", zone: "study", visibility: "household", x: 30, y: 65, zIndex: 2, state: "active" },
    ],
    adventures: [
      {
        id: "adventure-1",
        title: "Three shared dinners",
        status: "active",
        targetValue: 3,
        currentValue: 1,
        endsAt: "2026-08-22T23:59:59.000Z",
        visibility: "household",
      },
    ],
  };
}

function expectContractError(action, path, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ContractValidationError);
    assert.equal(error.path, path);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

test("valid v1 fixtures parse into normalized contract values", () => {
  assert.deepEqual(parseDailyMove(validDailyMove()), validDailyMove());
  assert.deepEqual(parseGameEvent(validGameEvent()), validGameEvent());
  assert.deepEqual(parseProgressBalance(validProgressBalance()), validProgressBalance());
  assert.deepEqual(parsePersonaManifest(validPersonaManifest()), validPersonaManifest());
  assert.deepEqual(parseWorldProjection(validWorldProjection()), validWorldProjection());
});

test("safeParse returns stable success and safe failure results", () => {
  const success = safeParse(parseDailyMove, validDailyMove());
  assert.equal(success.ok, true);

  const failure = safeParse(parseDailyMove, { privateValue: "do-not-echo" });
  assert.equal(failure.ok, false);
  assert.equal(failure.error.path, "$", "closed-object failure identifies its boundary");
  assert.equal(failure.error.message.includes("do-not-echo"), false);
});

test("DailyMove rejects unsupported versions and enum values", () => {
  const cases = [
    ["contractVersion", 2, "$.contractVersion", "unsupported_version"],
    ["movePolicyVersion", 2, "$.movePolicyVersion", "unsupported_version"],
    ["family", "sleep", "$.family"],
    ["ownership", "partner", "$.ownership"],
    ["visibility", "public", "$.visibility"],
    ["status", "paused", "$.status"],
    ["selectionReasonCode", "random", "$.selectionReasonCode"],
  ];

  for (const [field, value, path, code] of cases) {
    const fixture = validDailyMove();
    fixture[field] = value;
    expectContractError(() => parseDailyMove(fixture), path, code);
  }

  const badSource = validDailyMove();
  badSource.source.type = "email";
  expectContractError(() => parseDailyMove(badSource), "$.source.type");
});

test("DailyMove enforces completion, slot, duration, and date invariants", () => {
  const completed = validDailyMove();
  completed.status = "complete";
  expectContractError(() => parseDailyMove(completed), "$.completedAt", "missing_field");

  const activeWithCompletion = validDailyMove();
  activeWithCompletion.completedAt = timestamp;
  expectContractError(() => parseDailyMove(activeWithCompletion), "$.completedAt");

  const badSlot = validDailyMove();
  badSlot.slot = 4;
  expectContractError(() => parseDailyMove(badSlot), "$.slot");

  const badDuration = validDailyMove();
  badDuration.estimatedSeconds = 0;
  expectContractError(() => parseDailyMove(badDuration), "$.estimatedSeconds");

  const badDate = validDailyMove();
  badDate.localDate = "2026-02-31";
  expectContractError(() => parseDailyMove(badDate), "$.localDate");
});

test("MoveCompletionOptions validates closed, minimal source-specific responses", () => {
  const transaction = parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: "move-1",
    kind: "transaction",
    categories: [
      { id: "category-shared", name: "Groceries", ownership: "shared" },
      { id: "category-mine", name: "Personal", ownership: "personal" },
    ],
    createRuleDefault: false,
  });
  assert.equal(transaction.kind, "transaction");
  assert.equal(transaction.categories.length, 2);

  assert.deepEqual(parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: "move-2",
    kind: "goal",
    unitLabel: "sessions",
    defaultValue: 1,
  }), {
    contractVersion: 1,
    moveId: "move-2",
    kind: "goal",
    unitLabel: "sessions",
    defaultValue: 1,
  });
  assert.deepEqual(parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: "move-3",
    kind: "none",
  }), {
    contractVersion: 1,
    moveId: "move-3",
    kind: "none",
  });

  assert.throws(() => parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: "move-1",
    kind: "transaction",
    categories: [
      { id: "category-shared", name: "Groceries", ownership: "shared", merchant: "SECRET" },
    ],
    createRuleDefault: false,
  }), (error) => error instanceof ContractValidationError && error.code === "unknown_field");
  assert.throws(() => parseMoveCompletionOptions({
    contractVersion: 1,
    moveId: "move-1",
    kind: "transaction",
    categories: [],
    createRuleDefault: true,
  }), ContractValidationError);
});

test("GameEvent rejects unsupported event boundaries and invalid privacy", () => {
  const contractVersion = validGameEvent();
  contractVersion.contractVersion = 7;
  expectContractError(() => parseGameEvent(contractVersion), "$.contractVersion", "unsupported_version");

  const payloadVersion = validGameEvent();
  payloadVersion.payload.version = 2;
  expectContractError(() => parseGameEvent(payloadVersion), "$.payload.version", "unsupported_version");

  const eventType = validGameEvent();
  eventType.eventType = "account.created";
  expectContractError(() => parseGameEvent(eventType), "$.eventType");

  const sourceType = validGameEvent();
  sourceType.source.type = "account";
  expectContractError(() => parseGameEvent(sourceType), "$.source.type");

  const visibility = validGameEvent();
  visibility.visibility = "public";
  expectContractError(() => parseGameEvent(visibility), "$.visibility");

  const privateWithoutMember = validGameEvent();
  privateWithoutMember.visibility = "private";
  privateWithoutMember.memberId = null;
  expectContractError(() => parseGameEvent(privateWithoutMember), "$.memberId", "missing_field");
});

test("GameEvent payload data accepts extensions but rejects unsafe JSON", () => {
  const extension = validGameEvent();
  extension.payload.data.futureField = { supportedWithoutSchemaChange: true };
  assert.equal(parseGameEvent(extension).payload.data.futureField.supportedWithoutSchemaChange, true);

  const nonFinite = validGameEvent();
  nonFinite.payload.data.points = Number.NaN;
  expectContractError(() => parseGameEvent(nonFinite), "$.payload.data.points", "not_json_safe");

  const undefinedValue = validGameEvent();
  undefinedValue.payload.data.extra = undefined;
  expectContractError(() => parseGameEvent(undefinedValue), "$.payload.data.extra", "not_json_safe");

  const dateObject = validGameEvent();
  dateObject.payload.data.extra = new Date(timestamp);
  expectContractError(() => parseGameEvent(dateObject), "$.payload.data.extra", "not_json_safe");

  const nonObject = validGameEvent();
  nonObject.payload.data = [];
  expectContractError(() => parseGameEvent(nonObject), "$.payload.data", "invalid_type");

  const cyclic = validGameEvent();
  cyclic.payload.data.loop = cyclic.payload.data;
  expectContractError(() => parseGameEvent(cyclic), "$.payload.data.loop", "not_json_safe");
});

test("ProgressBalance validates versions, dimensions, ownership scope, and ranges", () => {
  const version = validProgressBalance();
  version.contractVersion = 2;
  expectContractError(() => parseProgressBalance(version), "$.contractVersion", "unsupported_version");

  const dimension = validProgressBalance();
  dimension.dimension = "wealth";
  expectContractError(() => parseProgressBalance(dimension), "$.dimension");

  const householdWithMember = validProgressBalance();
  householdWithMember.dimension = "household";
  expectContractError(() => parseProgressBalance(householdWithMember), "$.memberId");

  const personalWithoutMember = validProgressBalance();
  personalWithoutMember.memberId = null;
  expectContractError(() => parseProgressBalance(personalWithoutMember), "$.memberId", "missing_field");

  const negative = validProgressBalance();
  negative.lifetimePoints = -1;
  expectContractError(() => parseProgressBalance(negative), "$.lifetimePoints");

  const level = validProgressBalance();
  level.level = 0;
  expectContractError(() => parseProgressBalance(level), "$.level");
});

test("PersonaManifest rejects unsupported versions and invalid asset requirements", () => {
  const version = validPersonaManifest();
  version.manifestVersion = 2;
  expectContractError(() => parsePersonaManifest(version), "$.manifestVersion", "unsupported_version");

  const duplicateId = validPersonaManifest();
  duplicateId.assets[1].id = duplicateId.assets[0].id;
  expectContractError(() => parsePersonaManifest(duplicateId), "$.assets[1].id", "duplicate");

  const missingKind = validPersonaManifest();
  missingKind.assets[1].kind = "portrait";
  expectContractError(() => parsePersonaManifest(missingKind), "$.assets[1].kind", "duplicate");

  const nonSquarePortrait = validPersonaManifest();
  nonSquarePortrait.assets[0].height = 63;
  expectContractError(() => parsePersonaManifest(nonSquarePortrait), "$.assets");

  const opaqueAsset = validPersonaManifest();
  opaqueAsset.assets[0].transparent = false;
  expectContractError(() => parsePersonaManifest(opaqueAsset), "$.assets[0].transparent");
});

test("PersonaManifest rejects missing or duplicate required animations", () => {
  const missing = validPersonaManifest();
  missing.animations.pop();
  expectContractError(() => parsePersonaManifest(missing), "$.animations");

  const duplicate = validPersonaManifest();
  duplicate.animations[6].name = duplicate.animations[0].name;
  expectContractError(() => parsePersonaManifest(duplicate), "$.animations[6].name", "duplicate");

  const unsupported = validPersonaManifest();
  unsupported.animations[0].name = "dance";
  expectContractError(() => parsePersonaManifest(unsupported), "$.animations[0].name");
});

test("PersonaManifest rejects invalid grid, frame, asset, and anchor geometry", () => {
  const geometry = validPersonaManifest();
  geometry.grid.columns = 3;
  expectContractError(() => parsePersonaManifest(geometry), "$.grid");

  const frameColumn = validPersonaManifest();
  frameColumn.animations[0].frames[0].column = 4;
  expectContractError(() => parsePersonaManifest(frameColumn), "$.animations[0].frames[0].column");

  const assetReference = validPersonaManifest();
  assetReference.animations[0].assetId = "neutral-1";
  expectContractError(() => parsePersonaManifest(assetReference), "$.animations[0].assetId");

  const missingAnchor = validPersonaManifest();
  missingAnchor.attachmentAnchors.pop();
  expectContractError(() => parsePersonaManifest(missingAnchor), "$.attachmentAnchors");

  const duplicateAnchor = validPersonaManifest();
  duplicateAnchor.attachmentAnchors[3].kind = "hair";
  expectContractError(() => parsePersonaManifest(duplicateAnchor), "$.attachmentAnchors[3].kind", "duplicate");

  const outsideFrame = validPersonaManifest();
  outsideFrame.attachmentAnchors[0].x = 32;
  expectContractError(() => parsePersonaManifest(outsideFrame), "$.attachmentAnchors[0].x");
});

test("WorldProjection validates versions, ranges, relationships, and scene values", () => {
  const contractVersion = validWorldProjection();
  contractVersion.contractVersion = 2;
  expectContractError(() => parseWorldProjection(contractVersion), "$.contractVersion", "unsupported_version");

  const worldVersion = validWorldProjection();
  worldVersion.worldVersion = 2;
  expectContractError(() => parseWorldProjection(worldVersion), "$.worldVersion", "unsupported_version");

  const revision = validWorldProjection();
  revision.revision = -1;
  expectContractError(() => parseWorldProjection(revision), "$.revision");

  const position = validWorldProjection();
  position.personas[0].x = 101;
  expectContractError(() => parseWorldProjection(position), "$.personas[0].x");

  const personaMismatch = validWorldProjection();
  personaMismatch.personas[0].manifest.personaId = "persona-2";
  expectContractError(() => parseWorldProjection(personaMismatch), "$.personas[0].manifest.personaId");

  const adventureProgress = validWorldProjection();
  adventureProgress.adventures[0].currentValue = 4;
  expectContractError(() => parseWorldProjection(adventureProgress), "$.adventures[0].currentValue");

  const unsafeScene = validWorldProjection();
  unsafeScene.scene.key = "../private";
  expectContractError(() => parseWorldProjection(unsafeScene), "$.scene.key");
});

test("WorldProjection rejects duplicate record IDs", () => {
  const duplicatePersona = validWorldProjection();
  duplicatePersona.personas.push(copy(duplicatePersona.personas[0]));
  expectContractError(() => parseWorldProjection(duplicatePersona), "$.personas[1].id", "duplicate");

  const duplicateItem = validWorldProjection();
  duplicateItem.items.push(copy(duplicateItem.items[0]));
  expectContractError(() => parseWorldProjection(duplicateItem), "$.items[1].id", "duplicate");

  const duplicateAdventure = validWorldProjection();
  duplicateAdventure.adventures.push(copy(duplicateAdventure.adventures[0]));
  expectContractError(() => parseWorldProjection(duplicateAdventure), "$.adventures[1].id", "duplicate");
});

test("display world projections cannot contain private or household-only entities", () => {
  const persona = validWorldProjection();
  persona.viewer = "display";
  persona.items[0].visibility = "display";
  persona.adventures[0].visibility = "display";
  expectContractError(() => parseWorldProjection(persona), "$.personas[0].visibility");

  const adventure = validWorldProjection();
  adventure.viewer = "display";
  adventure.personas[0].visibility = "display";
  adventure.items[0].visibility = "display";
  expectContractError(() => parseWorldProjection(adventure), "$.adventures[0].visibility");

  const item = validWorldProjection();
  item.viewer = "display";
  item.personas[0].visibility = "display";
  item.adventures[0].visibility = "display";
  expectContractError(() => parseWorldProjection(item), "$.items[0].visibility");

  const displaySafe = validWorldProjection();
  displaySafe.viewer = "display";
  displaySafe.personas[0].visibility = "display";
  displaySafe.items[0].visibility = "display";
  displaySafe.adventures[0].visibility = "display";
  assert.equal(parseWorldProjection(displaySafe).viewer, "display");
});

test("closed public boundaries reject unknown fields without echoing their data", () => {
  const fixtures = [
    [validDailyMove(), parseDailyMove],
    [{ contractVersion: 1, moveId: "move-1", kind: "none" }, parseMoveCompletionOptions],
    [validGameEvent(), parseGameEvent],
    [validProgressBalance(), parseProgressBalance],
    [validPersonaManifest(), parsePersonaManifest],
    [validWorldProjection(), parseWorldProjection],
  ];

  for (const [fixture, parser] of fixtures) {
    fixture.unexpected = "TOP-SECRET-PAYLOAD";
    assert.throws(() => parser(fixture), (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "unknown_field");
      assert.equal(error.message.includes("TOP-SECRET-PAYLOAD"), false);
      assert.equal(error.message.includes("unexpected"), false);
      return true;
    });
  }
});
