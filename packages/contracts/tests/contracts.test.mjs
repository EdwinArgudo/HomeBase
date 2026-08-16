import assert from "node:assert/strict";
import test from "node:test";

import {
  ContractValidationError,
  parseDailyMove,
  parseMoveCompletionOptions,
  parseGameEvent,
  parsePersonaManifest,
  parsePersonaDraftInput,
  parsePersonaProfile,
  parsePersonaSnapshot,
  parsePlansAction,
  parsePlansSnapshot,
  parseProgressBalance,
  parseProgressSnapshot,
  parseRewardDefinition,
  parseRewardEquipInput,
  parseRewardProgress,
  parseRewardSnapshot,
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

function validProgressSnapshot() {
  return {
    contractVersion: 1,
    householdId: "household-1",
    member: { id: "member-1", displayName: "Edwin" },
    balances: [
      validProgressBalance(),
      { ...validProgressBalance(), id: "progress-household", memberId: null, dimension: "household" },
    ],
    generatedAt: timestamp,
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
        appearance: { character: "marshmallow" },
        equippedRewardKey: null,
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

function validPersonaProfile() {
  return {
    contractVersion: 1,
    id: "persona-1",
    householdId: "household-1",
    memberId: "member-1",
    displayName: "Edwin",
    creationMethod: "manual",
    status: "ready",
    baseStyleVersion: "pixel-v1",
    appearance: { character: "marshmallow" },
    visibility: "household",
    manifest: validPersonaManifest(),
    approvedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function validRewardDefinition() {
  return { catalogVersion: 1, key: "first-tend", kind: "emblem", title: "Steady Hands", description: "A calm first step.", dimension: "tend", thresholdPoints: 10 };
}

function validRewardSnapshot() {
  return {
    contractVersion: 1,
    catalogVersion: 1,
    policyVersion: 1,
    householdId: "household-1",
    memberId: "member-1",
    personaId: "persona-1",
    equippedRewardKey: "first-tend",
    generatedAt: timestamp,
    rewards: [{ contractVersion: 1, policyVersion: 1, reward: validRewardDefinition(), currentPoints: 10, unlockedAt: timestamp }],
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

test("ProgressSnapshot is closed and rejects mismatched, partner, and duplicate balances", () => {
  assert.equal(parseProgressSnapshot(validProgressSnapshot()).member.displayName, "Edwin");

  const household = validProgressSnapshot();
  household.balances[0].householdId = "household-other";
  expectContractError(() => parseProgressSnapshot(household), "$.balances[0].householdId");

  const partner = validProgressSnapshot();
  partner.balances[0].memberId = "member-partner";
  expectContractError(() => parseProgressSnapshot(partner), "$.balances[0].memberId");

  const duplicate = validProgressSnapshot();
  duplicate.balances.push({ ...validProgressBalance(), id: "progress-duplicate" });
  expectContractError(() => parseProgressSnapshot(duplicate), "$.balances[2].dimension", "duplicate");

  const extra = validProgressSnapshot();
  extra.member.email = "private@example.com";
  expectContractError(() => parseProgressSnapshot(extra), "$.member", "unknown_field");

  const invalidNested = validProgressSnapshot();
  invalidNested.balances[0].level = 0;
  expectContractError(() => parseProgressSnapshot(invalidNested), "$.balances[0].level");
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

test("manual persona contracts are closed and allow-list every appearance choice", () => {
  assert.deepEqual(parsePersonaDraftInput({
    contractVersion: 1,
    displayName: " Edwin ",
    visibility: "private",
    appearance: validPersonaProfile().appearance,
  }).displayName, "Edwin");

  const unknown = { contractVersion: 1, displayName: "Edwin", visibility: "private", appearance: validPersonaProfile().appearance, css: "url(secret)" };
  expectContractError(() => parsePersonaDraftInput(unknown), "$", "unknown_field");
  for (const [key, value] of [["character", "custom"]]) {
    const input = { contractVersion: 1, displayName: "Edwin", visibility: "private", appearance: { ...validPersonaProfile().appearance, [key]: value } };
    expectContractError(() => parsePersonaDraftInput(input), `$.appearance.${key}`);
  }
  expectContractError(() => parsePersonaDraftInput({ contractVersion: 1, displayName: " ", visibility: "private", appearance: validPersonaProfile().appearance }), "$.displayName");
});

test("persona profile enforces approval, visibility, and manifest identity invariants", () => {
  assert.deepEqual(parsePersonaProfile(validPersonaProfile()), validPersonaProfile());
  const draftApproved = { ...validPersonaProfile(), status: "draft" };
  expectContractError(() => parsePersonaProfile(draftApproved), "$.approvedAt");
  const readyUnapproved = { ...validPersonaProfile(), approvedAt: null };
  expectContractError(() => parsePersonaProfile(readyUnapproved), "$.approvedAt", "missing_field");
  const display = { ...validPersonaProfile(), visibility: "display" };
  expectContractError(() => parsePersonaProfile(display), "$.visibility");
  const mismatch = validPersonaProfile();
  mismatch.manifest.personaId = "persona-other";
  expectContractError(() => parsePersonaProfile(mismatch), "$.manifest.personaId");
});

test("persona snapshot rejects partner and household scope mismatches", () => {
  const snapshot = {
    contractVersion: 1,
    householdId: "household-1",
    memberId: "member-1",
    persona: validPersonaProfile(),
    generatedAt: timestamp,
  };
  assert.deepEqual(parsePersonaSnapshot(snapshot), snapshot);
  expectContractError(() => parsePersonaSnapshot({ ...snapshot, memberId: "member-2" }), "$.persona.memberId");
  expectContractError(() => parsePersonaSnapshot({ ...snapshot, householdId: "household-2" }), "$.persona.householdId");
});

test("reward contracts validate closed versions, keys, progress, and unlock invariants", () => {
  assert.deepEqual(parseRewardDefinition(validRewardDefinition()), validRewardDefinition());
  assert.deepEqual(parseRewardProgress(validRewardSnapshot().rewards[0]), validRewardSnapshot().rewards[0]);
  assert.deepEqual(parseRewardSnapshot(validRewardSnapshot()), validRewardSnapshot());
  const noPersona = { ...validRewardSnapshot(), personaId: null, equippedRewardKey: null, rewards: [{ ...validRewardSnapshot().rewards[0], currentPoints: 0, unlockedAt: null }] };
  assert.equal(parseRewardSnapshot(noPersona).personaId, null);

  for (const [field, value, path] of [
    ["catalogVersion", 2, "$.catalogVersion"], ["policyVersion", 2, "$.policyVersion"],
    ["personaId", "unsafe id", "$.personaId"],
  ]) expectContractError(() => parseRewardSnapshot({ ...validRewardSnapshot(), [field]: value }), path);

  expectContractError(() => parseRewardDefinition({ ...validRewardDefinition(), kind: "loot" }), "$.kind");
  expectContractError(() => parseRewardDefinition({ ...validRewardDefinition(), key: "secret-reward" }), "$.key");
  expectContractError(() => parseRewardDefinition({ ...validRewardDefinition(), thresholdPoints: -1 }), "$.thresholdPoints");
  expectContractError(() => parseRewardDefinition({ ...validRewardDefinition(), sourceEventId: "private" }), "$", "unknown_field");
  const premature = { ...validRewardSnapshot().rewards[0], currentPoints: 9 };
  expectContractError(() => parseRewardProgress(premature), "$.unlockedAt");
  const duplicate = validRewardSnapshot();
  duplicate.rewards.push(structuredClone(duplicate.rewards[0]));
  expectContractError(() => parseRewardSnapshot(duplicate), "$.rewards[1].reward.key", "duplicate");
  const leaked = { ...validRewardSnapshot(), partnerMemberId: "member-2" };
  expectContractError(() => parseRewardSnapshot(leaked), "$", "unknown_field");

  assert.deepEqual(parseRewardEquipInput({ contractVersion: 1, rewardKey: "first-tend" }), { contractVersion: 1, rewardKey: "first-tend" });
  assert.deepEqual(parseRewardEquipInput({ contractVersion: 1, rewardKey: null }), { contractVersion: 1, rewardKey: null });
  expectContractError(() => parseRewardEquipInput({ contractVersion: 1, rewardKey: "secret-reward" }), "$.rewardKey");
  expectContractError(() => parseRewardEquipInput({ contractVersion: 1, rewardKey: ["first-tend", "first-move"] }), "$.rewardKey");
  expectContractError(() => parseRewardEquipInput({ contractVersion: 1, rewardKey: null, extra: true }), "$", "unknown_field");

  const equippedMissing = validRewardSnapshot();
  equippedMissing.equippedRewardKey = "first-grow";
  expectContractError(() => parseRewardSnapshot(equippedMissing), "$.equippedRewardKey");
  const equippedLocked = validRewardSnapshot();
  equippedLocked.rewards.push({ ...structuredClone(equippedLocked.rewards[0]), reward: { ...validRewardDefinition(), key: "first-grow", dimension: "grow" }, unlockedAt: null });
  equippedLocked.equippedRewardKey = "first-grow";
  expectContractError(() => parseRewardSnapshot(equippedLocked), "$.equippedRewardKey");
  const equippedWithoutPersona = validRewardSnapshot();
  equippedWithoutPersona.personaId = null;
  expectContractError(() => parseRewardSnapshot(equippedWithoutPersona), "$.equippedRewardKey");
});

test("plans snapshot and actions are closed, bounded, and privacy-minimal", () => {
  const snapshot = {
    contractVersion: 1,
    tasks: [{ id: "task-1", title: "Take recycling out", status: "open", dueDate: "2026-08-16", owner: "you" }],
    groceries: [{ id: "grocery-1", name: "Oats", checked: false }],
    goals: [{ id: "goal-1", name: "Practice Spanish", ownership: "personal", trackingType: "sessions", targetValue: 12, minimumValue: 1, currentValue: 3 }],
    generatedAt: timestamp,
  };
  assert.deepEqual(parsePlansSnapshot(snapshot), snapshot);
  assert.deepEqual(parsePlansAction({ contractVersion: 1, action: "toggle_task", id: "task-1" }), { contractVersion: 1, action: "toggle_task", id: "task-1" });
  assert.deepEqual(parsePlansAction({ contractVersion: 1, action: "add_grocery", text: "  Apples  " }), { contractVersion: 1, action: "add_grocery", text: "Apples" });
  expectContractError(() => parsePlansSnapshot({ ...snapshot, memberId: "private" }), "$", "unknown_field");
  expectContractError(() => parsePlansSnapshot({ ...snapshot, tasks: [{ ...snapshot.tasks[0], ownerMemberId: "private" }] }), "$.tasks[0]", "unknown_field");
  expectContractError(() => parsePlansAction({ contractVersion: 1, action: "delete_goal", id: "goal-1" }), "$.action");
  expectContractError(() => parsePlansAction({ contractVersion: 1, action: "toggle_task", id: "task-1", text: "extra" }), "$.text", "unknown_field");
  expectContractError(() => parsePlansAction({ contractVersion: 1, action: "add_grocery", text: "x".repeat(121) }), "$.text");
  expectContractError(() => parsePlansAction({ contractVersion: 1, action: "add_grocery", text: "  " }), "$.text");
  expectContractError(() => parsePlansSnapshot({ ...snapshot, goals: [{ ...snapshot.goals[0], minimumValue: 13 }] }), "$.goals[0].minimumValue");
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

test("WorldPersona appearance and equipped emblem are allow-listed, nullable, and closed", () => {
  const withoutAppearance = validWorldProjection();
  withoutAppearance.personas[0].appearance = null;
  assert.equal(parseWorldProjection(withoutAppearance).personas[0].appearance, null);

  const unsafe = validWorldProjection();
  unsafe.personas[0].appearance = { ...unsafe.personas[0].appearance, css: "url(private)" };
  expectContractError(() => parseWorldProjection(unsafe), "$.personas[0].appearance", "unknown_field");

  const invalid = validWorldProjection();
  invalid.personas[0].appearance.character = "uploaded";
  expectContractError(() => parseWorldProjection(invalid), "$.personas[0].appearance.character");

  const equipped = validWorldProjection();
  equipped.personas[0].equippedRewardKey = "first-connect";
  assert.equal(parseWorldProjection(equipped).personas[0].equippedRewardKey, "first-connect");
  const unknownReward = validWorldProjection();
  unknownReward.personas[0].equippedRewardKey = "private-reward";
  expectContractError(() => parseWorldProjection(unknownReward), "$.personas[0].equippedRewardKey");

  const leaked = validWorldProjection();
  leaked.personas[0].memberId = "member-private";
  expectContractError(() => parseWorldProjection(leaked), "$.personas[0]", "unknown_field");
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
    [validProgressSnapshot(), parseProgressSnapshot],
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
