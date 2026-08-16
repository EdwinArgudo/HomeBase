import { parseProgressBalance, parseProgressSnapshot } from "@homebase/contracts";

import { progressFixtures } from "../fixtures/game";
import type { ProgressApi } from "./progress";

export function createFixtureProgressApi(): ProgressApi {
  return {
    async load() {
      return parseProgressSnapshot({
        contractVersion: 1,
        householdId: "household-homebase",
        member: { id: "member-edwin", displayName: "Edwin" },
        balances: [
          ...progressFixtures,
          parseProgressBalance({
            contractVersion: 1,
            id: "progress-household",
            householdId: "household-homebase",
            memberId: null,
            dimension: "household",
            lifetimePoints: 312,
            level: 4,
            updatedAt: "2026-08-15T12:00:00.000Z",
          }),
        ],
        generatedAt: "2026-08-15T12:00:00.000Z",
      });
    },
  };
}
