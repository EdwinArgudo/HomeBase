import { mount } from "@vue/test-utils";
import { parseDailyMove, parseMoveCompletionOptions } from "@homebase/contracts";
import { describe, expect, it } from "vitest";

import { dailyMoveFixtures } from "../fixtures/game";
import DailyMoveCard from "./DailyMoveCard.vue";

function goalMove() {
  return parseDailyMove({
    ...dailyMoveFixtures[1],
    source: { ...dailyMoveFixtures[1].source },
  });
}

function transactionMove() {
  return parseDailyMove({
    ...dailyMoveFixtures[0],
    source: { type: "transaction", id: "transaction-a" },
  });
}

describe("DailyMoveCard completion inputs", () => {
  it("submits a positive whole-number goal value", async () => {
    const move = goalMove();
    const wrapper = mount(DailyMoveCard, {
      props: {
        move,
        optionsState: "ready",
        completionOptions: parseMoveCompletionOptions({
          contractVersion: 1,
          moveId: move.id,
          kind: "goal",
          unitLabel: "progress units",
          defaultValue: 1,
        }),
      },
    });

    await wrapper.get('input[type="number"]').setValue("3");
    await wrapper.get(".action-button").trigger("click");
    expect(wrapper.emitted("complete")?.[0]).toEqual([move.id, { value: 3 }]);
  });

  it("submits only transaction category and create-rule inputs", async () => {
    const move = transactionMove();
    const wrapper = mount(DailyMoveCard, {
      props: {
        move,
        optionsState: "ready",
        completionOptions: parseMoveCompletionOptions({
          contractVersion: 1,
          moveId: move.id,
          kind: "transaction",
          categories: [{ id: "category-a", name: "Groceries", ownership: "shared" }],
          createRuleDefault: false,
        }),
      },
    });

    await wrapper.get("select").setValue("category-a");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get(".action-button").trigger("click");
    expect(wrapper.emitted("complete")?.[0]).toEqual([
      move.id,
      { categoryId: "category-a", createRule: true },
    ]);
  });

  it("disables actions while busy and exposes safe action errors", () => {
    const wrapper = mount(DailyMoveCard, {
      props: { move: transactionMove(), busy: true, actionError: "Replacement already used." },
    });
    expect(wrapper.findAll("button").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toBe("Replacement already used.");
  });
});
