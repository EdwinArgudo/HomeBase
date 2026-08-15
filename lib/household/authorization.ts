export type HouseholdIdentity = {
  id: string;
  household_id: string;
};

export function belongsToHousehold(member: HouseholdIdentity, record: { household_id: string }) {
  return member.household_id === record.household_id;
}

export function ownsPersonalRecord(member: HouseholdIdentity, ownerMemberId: string | null) {
  return ownerMemberId === member.id;
}

export function isUnownedOrOwned(member: HouseholdIdentity, ownerMemberId: string | null) {
  return ownerMemberId === null || ownsPersonalRecord(member, ownerMemberId);
}

export function relativeScope(type: string | null, ownerMemberId: string | null, currentMemberId: string) {
  if (type === "shared") return "ours" as const;
  return ownerMemberId === currentMemberId ? "mine" as const : "yours" as const;
}

export function normalizeMerchantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 120);
}
