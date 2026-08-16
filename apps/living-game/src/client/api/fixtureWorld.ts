import { parseWorldProjection } from "@homebase/contracts";

import { worldFixture } from "../fixtures/game";
import type { WorldApi } from "./world";

export function createFixtureWorldApi(): WorldApi {
  return {
    async load() {
      return parseWorldProjection(structuredClone(worldFixture));
    },
  };
}
