import * as Effect from "effect/Effect";

import ProjectionThreadsUnsettledAt from "./043_ProjectionThreadsUnsettledAt.ts";
import ClearAutomaticProjectModelDefaults from "./044_ClearAutomaticProjectModelDefaults.ts";
import ProjectionProjectsAutoPull from "./045_ProjectionProjectsAutoPull.ts";
import RepairAutomaticSettlementTimestamps from "./046_RepairAutomaticSettlementTimestamps.ts";
import ProjectionProjectIcon from "./047_ProjectionProjectIcon.ts";

export default Effect.gen(function* () {
  yield* ProjectionThreadsUnsettledAt;
  yield* ClearAutomaticProjectModelDefaults;
  yield* ProjectionProjectsAutoPull;
  yield* RepairAutomaticSettlementTimestamps;
  yield* ProjectionProjectIcon;
});
