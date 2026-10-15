import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Recovery also needs active messages and items outside the background-tool types.
  yield* sql`
    CREATE INDEX orchestration_v2_projection_turn_items_live_idx
    ON orchestration_v2_projection_turn_items(thread_id, ordinal, turn_item_id)
    WHERE status IN ('pending', 'running', 'waiting')
  `;
  yield* sql`
    CREATE INDEX orchestration_v2_projection_provider_turns_live_idx
    ON orchestration_v2_projection_provider_turns(thread_id)
    WHERE status IN ('pending', 'starting', 'running', 'waiting')
  `;
  yield* sql`
    CREATE INDEX orchestration_v2_projection_messages_streaming_idx
    ON orchestration_v2_projection_messages(thread_id, created_at, message_id)
    WHERE streaming = 1
  `;
});
