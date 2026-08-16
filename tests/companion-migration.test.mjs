import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { parsePersonaAppearance } from "@homebase/contracts";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);

async function orderedTags() {
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8"));
  return [...journal.entries].sort((left, right) => left.idx - right.idx).map((entry) => entry.tag);
}

async function apply(database, tag) {
  const sql = await readFile(new URL(`${tag}.sql`, migrationsDirectory), "utf8");
  database.exec(sql.replaceAll("--> statement-breakpoint", ""));
}

test("the companion migration converts stored human appearances in place", async () => {
  const tags = await orderedTags();
  const companionMigration = "0010_soft_companions";
  assert.ok(tags.includes(companionMigration), "the migration is registered in the journal");

  const database = new DatabaseSync(":memory:");
  for (const tag of tags.slice(0, tags.indexOf(companionMigration))) await apply(database, tag);

  database.exec(`
    INSERT INTO households (id, name) VALUES ('household-a', 'Home');
    INSERT INTO members (id, household_id, external_user_id, email, display_name)
      VALUES ('member-a', 'household-a', 'external-a', 'a@example.com', 'A'),
             ('member-b', 'household-a', 'external-b', 'b@example.com', 'B');
  `);
  const legacy = (id, member, appearance) => database
    .prepare(`INSERT INTO personas (id, household_id, member_id, display_name, appearance_json, status, approved_at)
      VALUES (?, 'household-a', ?, ?, ?, 'draft', NULL)`)
    .run(id, member, id, JSON.stringify(appearance));
  legacy("persona-berry", "member-a", { skinPalette: "deep", hairStyle: "curls", hairColor: "midnight", outfit: "berry", accent: "glasses" });
  legacy("persona-plain", "member-b", { skinPalette: "warm", hairStyle: "short", hairColor: "gold", outfit: "mint", accent: "none" });

  await apply(database, companionMigration);

  const rows = database.prepare("SELECT id, appearance_json, base_style_version FROM personas ORDER BY id").all();
  const converted = rows.map((row) => parsePersonaAppearance(JSON.parse(row.appearance_json)));

  // Outfit colour survives as the companion palette; the rest takes the default.
  assert.deepEqual(converted[0], { species: "marshmallow", palette: "blush", pattern: "plain", accessory: "glasses" });
  assert.deepEqual(converted[1], { species: "marshmallow", palette: "mint", pattern: "plain", accessory: "none" });
  assert.ok(rows.every((row) => row.base_style_version === "homebase-companion-v1"));

  // Re-running must not touch an already-converted row.
  await apply(database, companionMigration);
  const rerun = database.prepare("SELECT appearance_json FROM personas ORDER BY id").all();
  assert.deepEqual(rerun.map((row) => JSON.parse(row.appearance_json)), converted);

  database.close();
});
