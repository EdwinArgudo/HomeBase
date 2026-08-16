export type Identity = {
  externalId: string;
  email: string;
  displayName: string;
  /** True only for the localhost development fallback, never for a real user. */
  isLocalDevelopment: boolean;
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function identityFromRequest(request: Request): Identity {
  const externalId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");

  if (externalId && email) {
    let displayName = email.split("@")[0];
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        displayName = decodeURIComponent(encodedName);
      } catch {
        // Keep the email-derived fallback when the optional name is malformed.
      }
    }
    return { externalId, email: normalizeEmail(email), displayName, isLocalDevelopment: false };
  }

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return { externalId: "local-edwin", email: "edwin@homebase.local", displayName: "Edwin", isLocalDevelopment: true };
  }

  throw new HttpError(401, "Sign in to continue.");
}

export async function identityBeforeStorage<T>(request: Request, openStorage: () => Promise<T>) {
  const identity = identityFromRequest(request);
  const storage = await openStorage();
  return { identity, storage };
}
