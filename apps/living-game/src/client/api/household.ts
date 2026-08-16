export type HouseholdMember = {
  id: string;
  displayName: string;
  role: "owner" | "member";
  isYou: boolean;
};

export type HouseholdSummary = {
  householdName: string;
  members: HouseholdMember[];
  canInvite: boolean;
  invitation: { email: string; status: string } | null;
};

export interface HouseholdApi {
  load(): Promise<HouseholdSummary>;
  invite(email: string): Promise<{ email: string; status: string }>;
}

export class HouseholdApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HouseholdApiError";
  }
}

function record(input: unknown, fallback: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new HouseholdApiError(fallback);
  return input as Record<string, unknown>;
}

function text(value: unknown, fallback: string, max = 200) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new HouseholdApiError(fallback);
  return value;
}

function summaryFrom(input: unknown): HouseholdSummary {
  const fallback = "Unable to read your household.";
  const data = record(input, fallback);
  if (!Array.isArray(data.members)) throw new HouseholdApiError(fallback);
  const invitation = data.invitation === null || data.invitation === undefined
    ? null
    : (() => {
        const entry = record(data.invitation, fallback);
        return { email: text(entry.email, fallback), status: text(entry.status, fallback, 40) };
      })();
  return {
    householdName: text(data.householdName, fallback, 120),
    members: data.members.map((entry) => {
      const value = record(entry, fallback);
      const role = value.role === "owner" ? "owner" as const : "member" as const;
      return {
        id: text(value.id, fallback, 128),
        displayName: text(value.displayName, fallback, 120),
        role,
        isYou: value.isYou === true,
      };
    }),
    canInvite: data.canInvite === true,
    invitation,
  };
}

async function readJson(response: Response, fallback: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HouseholdApiError(fallback);
  }
  if (!response.ok) {
    const data = body as Record<string, unknown> | null;
    const message = data && typeof data.error === "string" ? data.error.trim() : "";
    throw new HouseholdApiError(message.length > 0 && message.length <= 200 ? message : fallback);
  }
  return body;
}

export function createHttpHouseholdApi(): HouseholdApi {
  return {
    async load() {
      const response = await fetch("/api/household/summary", { headers: { accept: "application/json" } });
      return summaryFrom(await readJson(response, "Unable to read your household."));
    },
    async invite(email) {
      const fallback = "Unable to send that invitation.";
      const response = await fetch("/api/household/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = record(await readJson(response, fallback), fallback);
      return { email: text(data.email, fallback), status: text(data.status, fallback, 40) };
    },
  };
}

export function createFixtureHouseholdApi(): HouseholdApi {
  const summary: HouseholdSummary = {
    householdName: "Our household",
    members: [
      { id: "member-edwin", displayName: "Edwin", role: "owner", isYou: true },
      { id: "member-vienna", displayName: "Vienna", role: "member", isYou: false },
    ],
    canInvite: false,
    invitation: null,
  };
  return {
    async load() {
      return { ...summary, members: summary.members.map((member) => ({ ...member })) };
    },
    async invite(email) {
      return { email, status: "pending" };
    },
  };
}
