import { describe, expect, it } from "vitest";

import type { HealthResponse } from "../shared/api";
import { app } from "./index";

describe("GET /api/health", () => {
  it("returns the typed service status", async () => {
    const response = await app.request("/api/health");
    const body: HealthResponse = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "homebase-living-game",
    });
  });
});
