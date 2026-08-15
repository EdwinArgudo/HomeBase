import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Homebase storage is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

export function getD1Database() {
  if (!env.DB) {
    throw new DatabaseUnavailableError();
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getD1Database(), { schema });
}
