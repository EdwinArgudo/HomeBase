export interface SettingsApi {
  loadRestMode(): Promise<boolean>;
  setRestMode(enabled: boolean): Promise<boolean>;
}

export class SettingsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsApiError";
  }
}

function enabledFrom(input: unknown, fallback: string): boolean {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new SettingsApiError(fallback);
  const record = input as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") throw new SettingsApiError(fallback);
  return record.enabled;
}

async function readJson(response: Response, fallback: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SettingsApiError(fallback);
  }
  if (!response.ok) {
    const record = body as Record<string, unknown> | null;
    const message = record && typeof record.error === "string" ? record.error.trim() : "";
    throw new SettingsApiError(message.length > 0 && message.length <= 200 ? message : fallback);
  }
  return body;
}

export function createHttpSettingsApi(): SettingsApi {
  return {
    async loadRestMode() {
      const response = await fetch("/api/settings/minimum-mode", { headers: { accept: "application/json" } });
      return enabledFrom(await readJson(response, "Unable to read Rest mode."), "Unable to read Rest mode.");
    },
    async setRestMode(enabled) {
      const response = await fetch("/api/settings/minimum-mode", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ enabled }),
      });
      return enabledFrom(await readJson(response, "Unable to update Rest mode."), "Unable to update Rest mode.");
    },
  };
}

export function createFixtureSettingsApi(initial = false): SettingsApi {
  let enabled = initial;
  return {
    async loadRestMode() {
      return enabled;
    },
    async setRestMode(next) {
      enabled = next;
      return enabled;
    },
  };
}
