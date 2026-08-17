/**
 * Vocabulary shared by more than one contract domain.
 *
 * Ownership and visibility appear on moves, events, personas and world items
 * alike, so they belong to no single domain module.
 */

export const OWNERSHIP_TYPES = ["personal", "shared"] as const;
export const VISIBILITIES = ["private", "household", "display"] as const;

export type OwnershipType = typeof OWNERSHIP_TYPES[number];
export type Visibility = typeof VISIBILITIES[number];
