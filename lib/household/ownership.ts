import { normalizeEmail } from "../auth/identity.ts";

/**
 * Who is allowed to claim an unclaimed Homebase.
 *
 * Bootstrapping only ever runs against an empty database, so the exposure is
 * narrow — but it is real: between a deployment and the owner's first sign-in,
 * whoever arrives first would become the household. Naming the owner in advance
 * closes that window, and closes it again if the database is ever recreated.
 *
 * An unconfigured deployment claims nothing. Refusing is the safe direction:
 * the cost is a household that has to be configured, against a household that
 * belongs to a stranger.
 */
export function parseConfiguredOwners(configured: string | undefined): readonly string[] {
  return (configured ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0);
}

export function mayBootstrapHousehold(input: {
  email: string;
  isLocalDevelopment: boolean;
  configuredOwners: string | undefined;
}): boolean {
  // Local development runs against a throwaway database on this machine only,
  // and its identity is already fixed to the localhost fallback.
  if (input.isLocalDevelopment) return true;

  const owners = parseConfiguredOwners(input.configuredOwners);
  if (owners.length === 0) return false;
  return owners.includes(normalizeEmail(input.email));
}
