import type { Identity } from "../auth/identity";

export type MemberRow = {
  id: string;
  household_id: string;
  external_user_id: string;
  email: string;
  display_name: string;
  role: "owner" | "member";
  personal_detail_visibility: "private" | "shared";
};

export type HouseholdContext = {
  identity: Identity;
  member: MemberRow;
  db: D1Database;
};
