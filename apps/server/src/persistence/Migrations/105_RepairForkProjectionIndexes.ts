import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import TurnItemTypeStatusIndex from "./088_TurnItemTypeStatusIndex.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP INDEX IF EXISTS orchestration_v2_projection_turn_items_message_order_idx`;
  yield* sql`DROP INDEX IF EXISTS orchestration_v2_projection_turn_items_thread_type_idx`;
  yield* TurnItemTypeStatusIndex;
});
