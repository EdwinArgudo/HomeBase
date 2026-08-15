import { getD1Database } from "../../db";
import { assertDatabaseSchemaReady } from "../../db/readiness";
import { HttpError } from "../auth/identity";

export function householdDatabase() {
  try {
    return getD1Database();
  } catch {
    throw new HttpError(503, "Homebase storage is unavailable.");
  }
}

export async function readyHouseholdDatabase() {
  const db = householdDatabase();
  try {
    await assertDatabaseSchemaReady(db);
  } catch {
    throw new HttpError(503, "Homebase storage needs an update. Please try again soon.");
  }
  return db;
}
