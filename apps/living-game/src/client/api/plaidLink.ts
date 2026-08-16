export type PlaidLinkResult = { publicToken: string; institutionName: string | null };

/**
 * Opens Plaid Link and resolves with what it returned, or null when the person
 * closed it without connecting. Everything about the bank itself happens inside
 * Plaid's own frame — Homebase never sees a credential.
 */
export type PlaidLinkLauncher = (linkToken: string) => Promise<PlaidLinkResult>;

export class PlaidLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaidLinkError";
  }
}

/** Resolves to null rather than throwing when Link is closed deliberately. */
export class PlaidLinkClosed extends Error {
  constructor(message = "No bank connection was changed.") {
    super(message);
    this.name = "PlaidLinkClosed";
  }
}

const SCRIPT_SOURCE = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

type PlaidHandler = { open(): void; destroy(): void };

type PlaidGlobal = {
  create(configuration: {
    token: string;
    onSuccess(publicToken: string, metadata: { institution?: { name?: string } | null }): void;
    onExit(error: { display_message?: string | null } | null): void;
  }): PlaidHandler;
};

function plaidGlobal(): PlaidGlobal | undefined {
  return (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
}

async function loadPlaidScript() {
  if (plaidGlobal()) return;
  await new Promise<void>((resolve, reject) => {
    const failed = () => reject(new PlaidLinkError("Plaid Link could not load."));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SOURCE}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", failed, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SOURCE;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = failed;
    document.head.appendChild(script);
  });
  if (!plaidGlobal()) throw new PlaidLinkError("Plaid Link could not load.");
}

export function createBrowserPlaidLinkLauncher(): PlaidLinkLauncher {
  return async (linkToken) => {
    await loadPlaidScript();
    const plaid = plaidGlobal();
    if (!plaid) throw new PlaidLinkError("Plaid Link could not load.");

    return new Promise<PlaidLinkResult>((resolve, reject) => {
      const handler = plaid.create({
        token: linkToken,
        onSuccess(publicToken, metadata) {
          handler.destroy();
          resolve({ publicToken, institutionName: metadata.institution?.name ?? null });
        },
        onExit(error) {
          handler.destroy();
          // Closing Link on purpose is not a failure worth an alert.
          reject(error?.display_message ? new PlaidLinkError(error.display_message) : new PlaidLinkClosed());
        },
      });
      handler.open();
    });
  };
}

export function createFixturePlaidLinkLauncher(): PlaidLinkLauncher {
  return async () => ({ publicToken: "public-sandbox-token", institutionName: "Demo Bank" });
}
