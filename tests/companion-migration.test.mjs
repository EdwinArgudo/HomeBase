import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { REQUIRED_ANIMATIONS, parsePersonaAppearance, parsePersonaProfile } from "@homebase/contracts";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);

async function orderedTags() {
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8"));
  return [...journal.entries].sort((left, right) => left.idx - right.idx).map((entry) => entry.tag);
}

async function apply(database, tag) {
  const sql = await readFile(new URL(`${tag}.sql`, migrationsDirectory), "utf8");
  database.exec(sql.replaceAll("--> statement-breakpoint", ""));
}

async function databaseThrough(tags) {
  const database = new DatabaseSync(":memory:");
  for (const tag of tags) await apply(database, tag);
  return database;
}

function seedHousehold(database, appearances) {
  database.exec(`
    INSERT INTO households (id, name) VALUES ('household-a', 'Home');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'A'),
             ('member-b', 'household-a', 'external-b', 'b@example.com', 'B'),
             ('member-c', 'household-a', 'external-c', 'c@example.com', 'C');
  `);
  const members = ["member-a", "member-b", "member-c"];
  appearances.forEach((appearance, index) => {
    database
      .prepare(`INSERT INTO personas (id, household_id, member_id, display_name, appearance_json, status, approved_at)
        VALUES (?, 'household-a', ?, ?, ?, 'draft', NULL)`)
      .run(`persona-${index}`, members[index], `persona-${index}`, JSON.stringify(appearance));
  });
}

function storedAppearances(database) {
  return database
    .prepare("SELECT appearance_json FROM personas ORDER BY id")
    .all()
    .map((row) => parsePersonaAppearance(JSON.parse(row.appearance_json)));
}

test("a persona created before the companion pivot survives the whole migration chain", async () => {
  const tags = await orderedTags();
  const firstConversion = tags.indexOf("0010_soft_companions");
  assert.ok(firstConversion > 0, "the companion migration is registered in the journal");

  const database = await databaseThrough(tags.slice(0, firstConversion));
  seedHousehold(database, [
    { skinPalette: "deep", hairStyle: "curls", hairColor: "midnight", outfit: "berry", accent: "glasses" },
    { skinPalette: "warm", hairStyle: "short", hairColor: "gold", outfit: "mint", accent: "none" },
    { skinPalette: "rose", hairStyle: "long", hairColor: "chestnut", outfit: "sun", accent: "headband" },
  ]);

  for (const tag of tags.slice(firstConversion)) await apply(database, tag);

  // A human appearance has no animal to preserve, so it lands on the default.
  assert.deepEqual(storedAppearances(database), [
    { character: "marshmallow" },
    { character: "marshmallow" },
    { character: "marshmallow" },
  ]);
  assert.ok(database.prepare("SELECT base_style_version FROM personas").all()
    .every((row) => row.base_style_version === "homebase-companion-v1"));
  database.close();
});

// A migrated persona has to survive the contract, not just the parser for one
// field: stamping SQLite's CURRENT_TIMESTAMP here once made every read 500.
function assertProfilesParse(database) {
  const rows = database.prepare(`SELECT id, household_id, member_id, display_name, creation_method,
    status, base_style_version, appearance_json, visibility, approved_at, created_at, updated_at
    FROM personas ORDER BY id`).all();
  for (const row of rows) {
    parsePersonaProfile({
      contractVersion: 1,
      id: row.id,
      householdId: row.household_id,
      memberId: row.member_id,
      displayName: row.display_name,
      creationMethod: row.creation_method,
      status: row.status,
      baseStyleVersion: row.base_style_version,
      appearance: JSON.parse(row.appearance_json),
      visibility: row.visibility,
      manifest: manifestFor(row.id, row.base_style_version),
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return rows;
}

function manifestFor(personaId, baseStyleVersion) {
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

test("a migrated persona still satisfies the persona contract", async () => {
  const tags = await orderedTags();
  const firstConversion = tags.indexOf("0010_soft_companions");
  const database = await databaseThrough(tags.slice(0, firstConversion));
  seedHousehold(database, [
    { skinPalette: "deep", hairStyle: "curls", hairColor: "midnight", outfit: "berry", accent: "glasses" },
  ]);
  for (const tag of tags.slice(firstConversion)) await apply(database, tag);

  const rows = assertProfilesParse(database);
  assert.match(rows[0].updated_at, /^\d{4}-\d{2}-\d{2}T.*Z$/, "timestamps stay ISO-8601");
  database.close();
});

test("the roster migration keeps each companion's animal and re-runs cleanly", async () => {
  const tags = await orderedTags();
  const rosterMigration = tags.indexOf("0011_character_roster");
  assert.ok(rosterMigration > 0, "the roster migration is registered in the journal");

  const database = await databaseThrough(tags.slice(0, rosterMigration));
  seedHousehold(database, [
    { species: "bunny", palette: "mint", pattern: "plain", accessory: "glasses" },
    { species: "cat", palette: "butter", pattern: "spots", accessory: "scarf" },
    { species: "dog", palette: "cream", pattern: "patch", accessory: "none" },
  ]);

  await apply(database, "0011_character_roster");

  // Palette only breaks the tie where the roster carries two of the same animal.
  const converted = storedAppearances(database);
  assert.deepEqual(converted, [
    { character: "moss-bunny" },
    { character: "cat" },
    { character: "pup" },
  ]);

  await apply(database, "0011_character_roster");
  assert.deepEqual(storedAppearances(database), converted, "a converted row is never touched again");
  database.close();
});
