# Database architecture

## Schema ownership

`db/schema.ts` is the canonical TypeScript description of the current D1
schema. The ordered SQL files in `drizzle/` are the only mechanism that creates
or changes deployed tables, columns, indexes, and foreign keys. The build
packages those checked-in migrations for the hosting control plane.

Runtime application code must never create, alter, repair, or optimize the
schema. Product requests may seed a new household only after the database has
already been migrated; seeding is application data, not schema management.

## Change and deployment flow

1. Update `db/schema.ts` for an approved schema change.
2. Generate one Drizzle migration with the root `db:generate` script.
3. Inspect the SQL and migration metadata before committing them together.
4. Apply the checked-in migrations before serving application code that
   requires the new schema.

Never edit an already-applied migration. Correct a deployed schema with a new,
forward-only migration and a separately reviewed data plan when needed.

## Runtime readiness and failure behavior

After identity is resolved, Homebase performs one read-only probe for columns
introduced by the latest migration. Ordered migration application means that a
successful probe confirms the migration chain reached the expected version.
The probe does not run migration SQL and is not cached, so a failed request can
recover as soon as deployment finishes applying migrations.

An unavailable or unmigrated database produces a safe `503` response. Provider
errors, SQL text, binding names, and migration internals are never returned to
the client. Existing records are read in place; request handling performs no
schema or data transformation.
