import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

// Tables that belong to exactly one household. A statement touching any of them
// must say so itself, rather than relying on a check earlier in the function.
const HOUSEHOLD_TABLES = new Set([
  "accounts", "bank_connections", "categories", "monthly_category_budgets", "transactions",
  "transaction_splits", "merchant_rules", "tasks", "grocery_items", "goals", "daily_moves",
  "personas", "game_events", "persona_unlocks", "household_unlocks", "progress_balances",
  "audit_events", "invitations", "members",
]);

const files = globSync("lib/**/*.ts").filter((path) => !path.includes("/tests/"));
const findings = [];

for (const path of files) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/prepare\(\s*`([^`]+)`/gs)) {
    const sql = match[1];
    const tables = new Set([...sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?/g)].map((entry) => entry[1]));
    const touched = [...tables].filter((table) => HOUSEHOLD_TABLES.has(table));
    if (touched.length === 0 || sql.includes("household_id")) continue;
    findings.push({
      path,
      line: source.slice(0, match.index).split("\n").length,
      tables: touched.sort(),
      sql: sql.split(/\s+/).join(" ").slice(0, 90),
    });
  }
}

for (const finding of findings) {
  console.error(`${finding.path}:${finding.line}  tables=${finding.tables.join(", ")}\n   ${finding.sql}\n`);
}

if (findings.length > 0) {
  console.error(`${findings.length} statement(s) touch household data without scoping it.`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} files: every statement touching household data scopes it.`);
}
