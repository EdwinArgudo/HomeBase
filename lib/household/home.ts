import { HttpError } from "../auth/identity";
import { requireMember } from "./membership";
import { toggleGroceryForHousehold, toggleTaskForHousehold } from "./home-queries";

export async function updateTask(request: Request, id: string) {
  const { member, db } = await requireMember(request);
  const updated = await toggleTaskForHousehold(db, member.household_id, id);
  if (!updated) throw new HttpError(404, "Task not found.");
}

export async function updateGrocery(request: Request, action: "add" | "toggle", input: { id?: string; text?: string }) {
  const { member, db } = await requireMember(request);
  if (action === "add") {
    const text = input.text?.trim();
    if (!text) throw new HttpError(400, "Enter a grocery item.");
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO grocery_items (id, household_id, added_by_member_id, name) VALUES (?, ?, ?, ?)").bind(id, member.household_id, member.id, text.slice(0, 120)).run();
    return { id, text, checked: false };
  }
  const updated = await toggleGroceryForHousehold(db, member.household_id, input.id);
  if (!updated) throw new HttpError(404, "Grocery item not found.");
  return null;
}
