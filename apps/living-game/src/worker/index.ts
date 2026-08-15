import { Hono } from "hono";

import type { HealthResponse } from "../shared/api";

export const app = new Hono();

app.get("/api/health", (context) =>
  context.json<HealthResponse>({
    status: "ok",
    service: "homebase-living-game",
  }),
);

export default app;
